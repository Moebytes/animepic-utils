import fs from "fs"
import path from "path"
import Pixiv from "pixiv.ts"
import phash from "sharp-phash"
import dist from "sharp-phash/distance"
import sharp from "sharp"
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

    /**
     * Filter out duplicates.
     */
    public static filterDuplicates = async (folder: string) => {
        const originalFolder = path.join(folder, "original")
        const dupeFolder = path.join(folder, "duplicates")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)

        imageUtils.moveImages(folder, originalFolder)

        const binaryToHex = (bin: string) => {
            return bin.match(/.{4}/g)?.reduce(function(acc, i) {
                return acc + parseInt(i, 2).toString(16).toUpperCase()
            }, "") || ""
        }

        const files = fs.readdirSync(originalFolder)
            .filter((f) => f !== ".DS_Store")
            .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        
        console.log("Generating hash map...")

        let hashMap = {} as {[key: string]: string}
        let i = 1
        for (const file of files) {
            console.log(`${i}/${files.length}`)
            let buffer = fs.readFileSync(path.join(originalFolder, file))
            const binary = await phash(buffer)
            hashMap[file] = binaryToHex(binary)
            i++
        }

        console.log("Checking for duplicates...")

        const processed = new Set<string>()

        for (let i = 0; i < files.length; i++) {
            const fileA = files[i]
            if (processed.has(fileA)) continue

            let folderKey = path.basename(fileA, path.extname(fileA))
            let shouldMove = false
            for (let j = i + 1; j < files.length; j++) {
                const fileB = files[j]
                if (processed.has(fileB)) continue

                if (dist(hashMap[fileA], hashMap[fileB]) < 6) {
                    let destFolder = path.join(dupeFolder, folderKey)
                    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, {recursive: true})
                    let src = path.join(originalFolder, fileB)
                    let dest = path.join(destFolder, fileB)
                    fs.renameSync(src, dest)
                    processed.add(fileB)
                    shouldMove = true
                }
            }
            if (shouldMove) {
                let destFolder = path.join(dupeFolder, folderKey)
                if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, {recursive: true})
                let src = path.join(originalFolder, fileA)
                let dest = path.join(destFolder, fileA)
                fs.renameSync(src, dest)
            }
            processed.add(fileA)
        }
    }

    private static normalizeFilename = (input: string) => {
        let {name, ext} = path.parse(input)
        name = name.replace(/\(.*?\)/g, "").trim()
        name = name.replace(/^[\d_]+/, "").trim()

        const isCamelCase = /^[a-z]+(?:[A-Z][a-z0-9]*)*$/.test(name)
        if (isCamelCase) return `${name}${ext}`

        const words = name
            .replace(/[^a-zA-Z0-9]+/g, " ").trim()
            .split(/\s+/).filter(Boolean)

        if (words.length === 0) return `${name}${ext}`

        const camel = words.map((w, i) => i === 0 ? w.toLowerCase() 
            : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("")

        return `${camel || name}${ext}`
    }

    /**
     * Process emojis.
     */
    public static emojiProcessing = async (folder: string) => {
        const originalFolder = path.join(folder, "original")
        const processedFolder = path.join(folder, "processed")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)
        if (!fs.existsSync(processedFolder)) fs.mkdirSync(processedFolder)

        imageUtils.moveImages(folder, originalFolder)
        imageUtils.copyImages(originalFolder, processedFolder)
        
        console.log("Processing images...")
        await imageUtils.processImages(processedFolder, 
            async (file) => imageUtils.resizeImage(file, 200),
            async (file) => {
                let newName = this.normalizeFilename(path.basename(file))
                let newDest = path.join(path.dirname(file), newName)
                fs.renameSync(file, newDest)
                return newDest
            }
        )
    }

    /**
     * Move images that do not have a very square aspect ratio.
     */
    public static moveNonSquare = async (folder: string, tolerance = 0.1) => {
        const originalFolder = path.join(folder, "original")
        const nonSquareFolder = path.join(folder, "nosquare")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)

        imageUtils.moveImages(folder, originalFolder)

        const files = fs.readdirSync(originalFolder)
            .filter((f) => f !== ".DS_Store")
            .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        
        let i = 1
        for (const file of files) {
            console.log(`${i}/${files.length}`)
            const filePath = path.join(originalFolder, file)
            const meta = await sharp(filePath).metadata()
            if (!meta.width || !meta.height) continue

            const aspect = meta.width / meta.height
            const lower = 1 - tolerance
            const upper = 1 + tolerance

            if (aspect < lower || aspect > upper) {
                if (!fs.existsSync(nonSquareFolder)) fs.mkdirSync(nonSquareFolder)
                fs.renameSync(filePath, path.join(nonSquareFolder, file))
            }
            i++
        }
    }
}