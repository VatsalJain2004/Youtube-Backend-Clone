import { v2 as cloudinary } from "cloudinary"
import fs from "fs"
import { validateHeaderName } from "http";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    // console.log(localFilePath);
    try {
        if (!localFilePath)
            return null


        if (!fs.existsSync(localFilePath)) {
            console.error(`File not found at path: ${localFilePath}`);
            return null;
        }


        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        // console.log("File or data given has been uploaded on cloudinary", response.url);
        fs.unlinkSync(localFilePath)
        // console.log(`\n\n\nUploadOnCloudinary response is: ${response}`);
        return response
    }
    catch (error) {

        console.error("Error during file upload:", error);

        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath); // Remove the file in case of error
        }
        return null
    }
}

export { uploadOnCloudinary }