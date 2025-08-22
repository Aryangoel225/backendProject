import mongoose from "mongoose"

import {ApiError} from "../utils/ApiError.js"

const errorHandler = (err, req, res, next) => {
    let error = err
    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || (error instanceof mongoose.Error ? 400 : 500)

        const message = error.message || "Internal Server Error"
        error = new ApiError(statusCode, message, error?.errors || [], err.stack)
    }

    const response = {
        ...error,
        message: error.message,
        ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {})
    }
    
    return res.status(error.statusCode).json(response)
}

export { errorHandler }