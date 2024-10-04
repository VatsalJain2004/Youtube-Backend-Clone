import dotenv from "dotenv"
import { app } from "./app.js"
import connectDB from "./db/index.js"

dotenv.config({
    path: './.env'
})

connectDB()
    .then(() => {
        app.on("error", (error) => {
            console.log(`server connection error:${error}`);
        })

        const port = process.env.PORT || 8000
        app.listen(port, () => {
            console.log(`Server is running at PORT = ${port}`);
        })
    })
    .catch((err) => {
        console.log(`MONGODB CONNECTION FAILED IN src/index.js error : ${err}`);
    })
