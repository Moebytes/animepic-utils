import "dotenv/config"
import utils from "./utils"

const start = async () => {
    let pixivKey = process.env.PIXIV_REFRESH_TOKEN!
    let processFolder = process.env.PROCESS_FOLDER!

    // await utils.image.recoverFromPixiv(processFolder, pixivKey)
    // await utils.image.filterAIImages(processFolder, pixivKey)
    
    await utils.image.moepicsProcess(processFolder)

    // utils.image.changeQualifiers(processFolder, "g")
    // await utils.animation.upscaleUgoira(processFolder)
}

start()