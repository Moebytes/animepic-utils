import "dotenv/config"
import utils from "./utils"

const start = async () => {
    let pixivKey = process.env.PIXIV_REFRESH_TOKEN!
    let recoveryFolder = process.env.RECOVERY_FOLDER!
    let processFolder = process.env.PROCESS_FOLDER!

    // await utils.image.recoverFromPixiv(recoveryFolder, pixivKey)
    // await utils.image.filterAIImages(recoveryFolder, pixivKey)
    // await utils.image.moepicsProcess(processFolder)
    // utils.image.changeQualifiers(processFolder, "c")

    await utils.animation.upscaleUgoira(processFolder)
}

start()