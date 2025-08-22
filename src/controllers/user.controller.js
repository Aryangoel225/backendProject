import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.models.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import {ApiResponse} from "../utils/ApiResponse.js"

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

export {
    registerUser
}