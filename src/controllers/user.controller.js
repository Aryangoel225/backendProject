import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHander} from "../utils/asyncHandler.js"
import jwt from "jsonwebtoken"



const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) throw new ApiError(404, "User not found");
    
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
    
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    } catch (error) {
        console.error("Error generating tokens:", error);
        throw new ApiError(500, "Something went wrong while generating tokens");
    }
}

const  registerUser = asyncHandler(async(req, res) =>{
    // Implement user registration logic
    const { fullname, email, username, password } = req.body;

    // validation
    if ([fullname, email, username, password].some(field => field?.trim() === "")) {
       throw new ApiError(400, "All fields are required");
    }

    const existed = await User.findOne({
        $or: [{username: fullname},{email}]
    })

    if (existed) {
        throw new ApiError(409, "User with email or username already exist");
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path
    const coverLocalPath = req.files?.coverImage?.[0]?.path

    // if (!avatarLocalPath) {
    //     throw new ApiError(400, "Avatar file is missing");
    // }
    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // let coverImage = ""
    // if (coverLocalPath) {
    //     coverImage = await uploadOnCloudinary(coverLocalPath)
    // }
    let avatar 
    try{
        avatar = await uploadOnCloudinary(avatarLocalPath)
        console.log("Uploaded avatar to Cloudinary:", avatar)
    }catch (error){
        throw new ApiError(500, "Error uploading avatar")
    }

    let coverImage 
    try{
        coverImage = await uploadOnCloudinary(coverLocalPath)
        console.log("Uploaded cover image to Cloudinary:", coverImage)
    }catch (error){
        throw new ApiError(500, "Error uploading cover image")
    }

    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering a user")
    }

    return res
        .status(201)
        .json(new ApiResponse(201, createdUser, "User registered successfully"))
})

const loginUser = asyncHandler(async (req, res) => {
    // get data from request body
    const { email, username, password } = req.body;

    // validation
    if ([email, username, password].some(field => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required");
    }

    const user = await User.findOne({ $or: [{ email }, { username }] })

    if (!user) {
        throw new ApiError(401, "Invalid email or password");
    }

    // validate password
    const isPasswordCorrect = await user.isPasswordCorrect(password);
    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");
    
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully"));
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        { $set: { refreshToken: undefined, } },
        { new: true }
    )

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    // reads refresh token from cookies or request body
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    // check if refresh token is present
    if (!incomingRefreshToken){
        throw new ApiError(401, "Refresh token is missing");
    }

    // verify refresh token with jwt 
    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        // find user by id
        const user = await User.findById(decodedToken?._id)
        // if no user invalid
        if (!user){
            throw new ApiError(401, "Invalid refresh token")
        }
        // check if refresh token matches
        if (incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Invalid refresh token")
        }

       
        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
        }

         // generate new access and refresh tokens (access: shortlived refresh: longlived in DB)
        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshToken(user._id);

        // send response back with new tokens 
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200, 
                    {accessToken,
                     refreshToken: newRefreshToken },
                    "Access token refreshed successfully"
                ));

    } catch (error) {
        throw new ApiError(500, "Something went wrong while refreshing access token");
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    // find user
    const user = await User.findById(req.user._id);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // validate current password
    const isCurrentPasswordValid = await user.isPasswordCorrect(currentPassword);
    if (!isCurrentPasswordValid) {
        throw new ApiError(401, "Invalid current password");
    }

    // change password
    user.password = newPassword;
    await user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullname, email } = req.body;

    if(!fullname) {
        throw new ApiError(400, "Fullname is required");
    }

    if(!email) {
        throw new ApiError(400, "Email is required");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id, { 
            $set: { fullname, email } 
        }, 
        { new: true, runValidators: true }
    ).select("-password -refreshToken");

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, { user }, "Account details updated successfully"));
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.files?.path

    if(!avatarLocalPath) {
           throw new ApiError(400, "Avatar image is required");
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
          throw new ApiError(500, "Failed to upload avatar");
    }

      await User.findByIdAndUpdate(req.user._id, { avatar: avatar.url }, { new: true });
    return res
        .status(200)
        .json(new ApiResponse(200, {$set: { avatar: avatar.url }}, "User avatar updated successfully"));
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.files?.path
    // check if cover image is provided
    if(!coverImageLocalPath) {
        throw new ApiError(400, "Cover image is required");
    }

    // upload on cloudinary
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
        throw new ApiError(500, "Failed to upload cover image");
    }

    // update user cover image
    await User.findByIdAndUpdate(req.user._id, { coverImage: coverImage.url }, { new: true }).select("-password -refreshToken");

    return res
        .status(200)
        .json(new ApiResponse(200, {$set: { coverImage: coverImage.url }}, "User cover image updated successfully"));
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.param;
    if (!username?.trim()) throw new ApiError(400, "username is missing");

    const channel = await User.aggregate([
        { $match: { username: username?.toLowerCase() } },
        { $lookup: { from: "subscriptions", localField: "_id", foreignField: "channel", as: "subscribers" } },
        { $lookup: { from: "subscriptions", localField: "_id", foreignField: "subscriber", as: "subscribedTo" } },
        { $addFields: {
            subscribersCount: { $size: "$subscribers" },
            channelsSubscribedToCount: { $size: "$subscribedTo" },
            isSubscribed: { $cond: { if: { $in: [req.user?._id, "$subscribers.subscriber"] }, then: true, else: false } }
        }},
        { $project: { fullName: 1, username: 1, subscribersCount: 1, channelsSubscribedToCount: 1, isSubscribed: 1, avatar: 1, coverImage: 1, email: 1 } }
    ]);
    if (!channel?.length) throw new ApiError(404, "channel does not exists");
    return res.status(200).json(new ApiResponse(200, channel[0], "User channel fetched successfully"));
});

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(req.user._id) } },
        { $lookup: {
            from: "videos", localField: "watchHistory", foreignField: "_id", as: "watchHistory",
            pipeline: [
                { $lookup: {
                    from: "user", localField: "owner", foreignField: "_id", as: "owner",
                    pipeline: [{ $project: { fullName: 1, username: 1, avatar: 1 } }]
                }},
                { $addFields: { owner: { $first: "$owner" } } }
            ]
        }}
    ]);
    return res.status(200).json(new ApiResponse(200, user[0].watchHistory, "Watch history fetched successfully"));
});

export {
    registerUser,
    loginUser,
    refreshAccessToken,
    changeCurrentPassword,
    logoutUser,
    changeCurrentPassword,
    updateUserAvatar,
    updateUserCoverImage,
    updateAccountDetails,
    getCurrentUser
}