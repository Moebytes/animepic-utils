import fs from "fs"
import path from "path"
import Pixiv from "pixiv.ts"
import imageUtils from "./image-utils"

export default class DownloadUtils {
    /**
     * Download original pixiv posts, in a folder containing images with pixiv ID filenames (unknown quality).
     */
    public static downloadOriginals = async (folder: string, pixivRefreshToken?: string) => {
        const pixiv = await Pixiv.refreshLogin(pixivRefreshToken!)
        const originalFolder = path.join(folder, "original")
        const pixivFolder = path.join(folder, "pixiv")
        const errorFolder = path.join(folder, "error")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)
        
        imageUtils.moveImages(folder, originalFolder)

        const files = fs.readdirSync(originalFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        let i = 1
        for (const file of files) {
            console.log(`${i}/${files.length}  -> ${file}`)
            let pixivID = file.match(/\d{5,}/)?.[0]
            if (pixivID) {
                try {
                    let illust = await pixiv.illust.get(pixivID)
                    const result = await pixiv.util.downloadIllust(illust, pixivFolder, "original")
                    if (result.endsWith("illust.png")) {
                        fs.unlinkSync(result)
                        if (!fs.existsSync(errorFolder)) fs.mkdirSync(errorFolder)
                        let src = path.join(originalFolder, file)
                        let dest = path.join(errorFolder, file)
                        fs.renameSync(src, dest)
                    }
                } catch {
                    if (!fs.existsSync(errorFolder)) fs.mkdirSync(errorFolder)
                    let src = path.join(originalFolder, file)
                    let dest = path.join(errorFolder, file)
                    fs.renameSync(src, dest)
                }
            } else {
                if (!fs.existsSync(errorFolder)) fs.mkdirSync(errorFolder)
                let src = path.join(originalFolder, file)
                let dest = path.join(errorFolder, file)
                fs.renameSync(src, dest)
            }
            i++
        }
    }

    /**
     * Download any missing pixiv images.
     */
    public static downloadMissingPixiv = async (folder: string, pixivRefreshToken?: string) => {
        const pixiv = await Pixiv.refreshLogin(pixivRefreshToken!)
        const originalFolder = path.join(folder, "original")
        const missingFolder = path.join(folder, "missing")
        const extraFolder = path.join(folder, "extra")
        const errorFolder = path.join(folder, "error")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)
        
        imageUtils.moveImages(folder, originalFolder)

        const files = fs.readdirSync(originalFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)

        let fileObj = {} as {[key: string]: string[]}
        for (const file of files) {
            let id = file.split("_")[0]
            if (fileObj[id]) {
                fileObj[id].push(file)
            } else {
                fileObj[id] = [file]
            }
        }

        let i = 1
        for (const [key, value] of Object.entries(fileObj)) {
            let pixivID = value[0].match(/\d{5,}/)?.[0]
            console.log(`${i}/${Object.entries(fileObj).length}  -> ${pixivID}`)
            if (pixivID) {
                try {
                    let illust = await pixiv.illust.get(pixivID)
                    if (value.length !== illust.page_count) {
                        if (!fs.existsSync(extraFolder)) fs.mkdirSync(extraFolder)
                        for (const file of value) {
                            let src = path.join(originalFolder, file)
                            let dest = path.join(extraFolder, file)
                            fs.renameSync(src, dest)
                        }
                        const result = await pixiv.util.downloadIllust(illust, missingFolder, "original")
                        if (result.endsWith("illust.png")) {
                            fs.unlinkSync(result)
                            if (!fs.existsSync(errorFolder)) fs.mkdirSync(errorFolder)
                            for (const file of value) {
                                let src = path.join(extraFolder, file)
                                let dest = path.join(errorFolder, file)
                                fs.renameSync(src, dest)
                            }
                        } else {
                            const missingFiles = fs.readdirSync(missingFolder).filter((f) => f !== ".DS_Store")
                            .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)

                            let matching = missingFiles.filter((f) => f.match(/\d{5,}/)?.[0] === pixivID)
                            for (const file of matching) {
                                let src = path.join(missingFolder, file)
                                let matchFile = value.find((v) => parseInt(v.replace(/\*\d+\*/g, "").split("_")[1]) === parseInt(file.split("_")[1])) || file
                                let qualifier = matchFile.split("_").slice(1).join("_")
                                let newName = `${file.split("_")[0]}_${qualifier}`
                                let dest = path.join(missingFolder, newName)
                                fs.renameSync(src, dest)
                            }
                        }
                    }
                } catch {
                    if (!fs.existsSync(errorFolder)) fs.mkdirSync(errorFolder)
                    for (const file of value) {
                        let src = path.join(originalFolder, file)
                        let dest = path.join(errorFolder, file)
                        fs.renameSync(src, dest)
                    }
                }
            } else {
                if (!fs.existsSync(errorFolder)) fs.mkdirSync(errorFolder)
                for (const file of value) {
                    let src = path.join(originalFolder, file)
                    let dest = path.join(errorFolder, file)
                    fs.renameSync(src, dest)
                }
            }
            i++
        }
    }
}