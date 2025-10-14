import "dotenv/config"
import imageUtils from "./image-utils"

const start = async () => {
    let pixivKey = process.env.PIXIV_REFRESH_TOKEN!
    let folder = process.env.FOLDER!

    // await imageUtils.recoverFromPixiv(folder, pixivKey)
    // await imageUtils.filterAIImages(folder, pixivKey)
    await imageUtils.moepicsProcess(folder)
    // imageUtils.changeQualifiers(folder, "c")
}

start()