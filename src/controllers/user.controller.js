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
    const { fullname, email, password } = req.body;

    // validation
    if ([fullname, email, password].some(field => field?.trim() === "")) {
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

export {
    registerUser,
    loginUser,
    refreshAccessToken,
    logoutUser
}