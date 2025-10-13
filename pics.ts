import "dotenv/config"
import imageUtils from "./image-utils"

const start = async () => {
    imageUtils.changeQualifiers(process.env.FOLDER!, "c")
}

start()