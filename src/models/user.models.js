import mongoose, { Schema } from "mongoose";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        fullname: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        avatar: {
            type: String, // cloudinary URL
            required: true,
        },
        coverImage: {
            type: String, // cloudinary URL
            required: true,
        },
        watchHistory: [
            {
                type: Schema.Types.ObjectId, // Array of video IDs
                ref: "Video",
                default: []
            }
        ],
        password: {
            type: String,
            required: [true, "Password is required"],
            select: false
        },
        refreshToken: {
            type: String,
        }
    },
    { timestamps: true }
)

export const User = mongoose.model("User", userSchema)