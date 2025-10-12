import "dotenv/config"
import imageUtils from "./image-utils"

const start = async () => {
    await imageUtils.splitFolder(process.env.FOLDER!)
}

start()