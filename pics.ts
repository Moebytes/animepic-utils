import "dotenv/config"
import imageUtils from "./entities/ImageUtils"

const start = async () => {
    await imageUtils.splitFolder(process.env.FOLDER!)
}

start()