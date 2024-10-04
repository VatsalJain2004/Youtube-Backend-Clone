import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import verifyJWT from "jsonwebtoken"
import { v2 as cloudinary } from "cloudinary"
import mongoose from "mongoose"

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)

        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }
    }
    catch (error) {
        console.log("error while generating acces and refresh tokens..", error);
        throw new ApiError(500, 'Something went wrong while generating access and refresh tokens...')
    }
}


const registerUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    // validation - not empty
    // check if user already exists: username, email
    // check for images, check for avatar
    // upload them to cloudinary, avatar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res

    const { fullName, email, username, password } = req.body
    // console.log('\n\n\nThis is req.body in user.controller.js:', req.body);

    if (
        [fullName, email, password, username]
            .some((field) => !field || field.trim() === "")
    ) throw new ApiError(400, `${field} is required`)


    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (existedUser)
        throw new ApiError(409, `User with username/email already exists...`)

    // console.log('\n\n\nThis is req.files through which we find the localPath of avatar and coverImage:', req.files);
    let avatarLocalPath = ""
    if (req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0)
        avatarLocalPath = req.files?.avatar[0]?.path
    else if (!req.files || !Array.isArray(req.files.avatar) || !req.files.avatar.length > 0)
        throw new ApiError(400, `Plz chose an avatar`)

    let coverImageLocalPath = ""
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0)
        coverImageLocalPath = req.files?.coverImage[0]?.path

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar)
        throw new ApiError(400, `avatar not uploaded on cloudinary`)

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser)
        throw new ApiError(500, `User couldn't be created...`)

    res.status(201).json(
        new ApiResponse(201, createdUser, `User registed Sucessfuly...`)
    )
})

const loginUser = asyncHandler(async (req, res) => {
    /*for a login to user following security checks must be done..
    1.email/phone no. or anything similar should be unique and must exists to login
    2.entered password matches or not.. also password can't be empty and must be of certain length(if any restrictions is specified then)
    3.if password matches generate access and refresh Tokens...
    4.send tokens in form of cookies..
    5.sign up if all goes as OK
    */

    const { email, username, password } = req.body
    if (!username && !email)
        throw new ApiError(400, `username/email field is required`)

    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user)
        throw new ApiError(404, `User with ${user.email} does not exists. Plz sign up first`)

    if (!password)
        throw new ApiError(404, `password is required...`)

    const isPasswordValid = await user.isPasswordCorrect(password)
    if (!isPasswordValid)
        throw new ApiError(404, `password is incorrect...`)

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")


    //Options are send with cookies so define its certain prooperties like it can only my modified by the server -- httpOnly and secure
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(201)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser, accessToken, refreshToken
                },
                "User logged-in Successfully.."
            )
        )
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshTokens: 1
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, `User Logged-Out Successfully`))
})






const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken)
        throw new ApiError(401, `Unauthorized Access...`)

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        const user = await User.findById(decodedToken?._id)

        if (!user)
            throw new ApiError(401, `Unauthorized Access...`)

        if (incomingRefreshToken != user?.refreshToken)
            throw new ApiError(401, `Refresh Token is expired or used...`)

        const options = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id)
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200, { accessToken, refreshToken: newRefreshToken },
                    `Access Token Refreshed...`
                )
            )
    }
    catch (error) {
        throw new ApiError(401, error?.message || 'Invalid Refresh Tokens...')
    }
})






const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body

    const user = await req.User;
    const isPasswordCorrectCheck = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrectCheck)
        throw new ApiError(`Invalid Password`)

    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return res
        .status(200)
        .json(new ApiResponse(200, {}, `Password changed Successfully`))
})


const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(
            200, req.user, `Current User fetched Successfully...`
        ))
})



const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body

    if (!fullName || !email)
        throw new ApiError(400, `Plz specify the details to be changed/updated...`)

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email,
            }
        },
        {
            new: true,
        }
    ).select("-password")

    return res
        .status(200)
        .json(
            new ApiResponse(
                200, user, `User Details Updated Successfully...`
            )
        )

})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const oldAvatarUrl = (await User.findById(req.user._id)).avatar;

    const getPublicIdFromCloudinary = (url) => {
        const parts = url.split('/')
        const lastPart = parts(parts.length - 1)
        return lastPart.split('.')[0]
    }

    const avatarPublicId = getPublicIdFromCloudinary(oldAvatarUrl);

    const deleteFromCloudinary = async (publicId) => {
        try {
            const response = await cloudinary.uploader.destroy(publicId, {
                resource_type: "auto"
            })

            if (response.result !== 'ok') {
                console.log('error while destroying ur resouce from cloudinry...');
                throw new ApiError(500, 'error while destroying ur resouce from cloudinry...')
            }

            console.log('Successfully deleted ur resouce from cloudinry...');
        }
        catch (error) {
            console.log('Error while deleting avatar from cloudinary..');
        }
    }

    await deleteFromCloudinary(avatarPublicId)

    const avatarLocalPath = req.files?.path

    if (!avatarLocalPath)
        throw new ApiError(400, 'Avatar file is missing...')

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url)
        throw new ApiError(500, 'Error while uploading avatar...')

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {
            new: true,
        }
    ).select("-password")

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, 'User Avatar is Updated')
        )
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.files?.path

    if (!coverImageLocalPath)
        throw new ApiError(401, `Please provide a new coverImage to change to...`)

    let coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!coverImage.url)
        throw new ApiError(500, 'Error while uploading the coverImage...')

    const user = await User.findByIdAndUpdate(
        {
            $set: {
                coverImage
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
        .status(200)
        .json(
            new ApiResponse(200, user, 'Cover-Image is updated!!')
        )
})




const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params

    if (!username?.trim())
        throw new ApiError(400, `Channel with username: ${username} doesn't exists..`)

    const channel = await User.aggregat(
        [
            {
                $match: {
                    username: username?.toLowerCase()
                }
            },
            {
                $lookup: {
                    from: "subscriptions",
                    localField: "_id",
                    foreignField: "channel",
                    as: "subscribers"
                }
            },
            {
                $lookup: {
                    from: "subscriptions",
                    localField: "_id",
                    foreignField: "subscriber",
                    as: "subscribedTo"
                }
            },
            {
                $addFields: {
                    subscribersCount: {
                        $size: "subscribers"
                    },
                    channelsSubscribedToCount: {
                        $size: "subscriberTo"
                    },
                    isSubscribed: {
                        $cond: {
                            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                            then: true,
                            else: false,
                        }
                    }
                }
            },
            {
                $project: {
                    fullName: 1,
                    username: 1,
                    subscribersCount: 1,
                    channelsSubscribedToCount: 1,
                    isSubscribed: 1,
                    avatar: 1,
                    coverImage: 1,
                    email: 1
                }
            }
        ]
    )


    if (!channel?.length)
        throw new ApiError(404, `channel does not exists...`)

    return res
        .status(200)
        .json(
            new ApiResponse(200, channel[0], `User channel fecthed Successfully..`)
        )
})



const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                user[0].watchHistory,
                `Watch History Fetched Succcessfully`
            )
        )
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage, getUserChannelProfile, getWatchHistory }