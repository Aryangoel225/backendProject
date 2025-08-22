import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken";


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

userSchema.pre("save", async function(next) {
    if (!this.isModified("password")) return next();
    // Hash the password
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.isPasswordCorrect = async function(password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function (){
    // short lived access token
    return jwt.sign({ 
        _id: this._id,
        email: this.email,
        username: this.username,
        fullname: this.fullname
    }, process.env.ACCESS_TOKEN_SECRET, 
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY });
}

userSchema.methods.generateRefreshToken = function (){
    // long lived refresh token
    return jwt.sign({ 
        _id: this._id,
    }, process.env.REFRESH_TOKEN_SECRET, 
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY });
}

export const User = mongoose.model("User", userSchema)