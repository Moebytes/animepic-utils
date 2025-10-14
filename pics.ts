import "dotenv/config"
import imageUtils from "./image-utils"

const start = async () => {
    // await imageUtils.recoverFromDanbooru(process.env.FOLDER!)
    await imageUtils.moepicsProcess(process.env.FOLDER!)
    // imageUtils.changeQualifiers(process.env.FOLDER!, "c")
}

start()