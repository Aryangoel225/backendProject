import jwt from "jsonwebtoken"
import {User} from "../models/user.models.js"
import {ApiError} from "../utils/ApiError.js"
import {asyncHandler} from "../utils/asyncHandler.js"

export const verifyJWT = asyncHandler(async (req, _, next) => {
    // get access token from cookies or headers
    const token = req.cookies.accessToken || req.headers("Authorization")?.replace("Bearer ", "");

    // if no token throw error
    if (!token) {
        throw new ApiError(401, "Access token is missing");
    }


    try {
        // verify token
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        // find user
        const user = await User.findById(decodedToken._id).select("-password -refreshToken");

        if (!user) {
            throw new ApiError(401, "User not found");
        }
        // attach user to request so you can use _id later
        req.user = user;
        
        next();

    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid access token");
    }
});