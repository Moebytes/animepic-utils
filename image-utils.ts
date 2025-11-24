import fs from "fs"
import path from "path"
import sharp from "sharp"
import NodeFormData from "form-data"
import axios from "axios"
import waifu2x, {Waifu2xOptions} from "waifu2x"
import Pixiv from "pixiv.ts"
import * as cheerio from "cheerio"

type Formats = "jpg" | "png" | "webp" | "avif" | "jxl"

type FormatOptionMap = {
  jpg: sharp.JpegOptions
  png: sharp.PngOptions
  webp: sharp.WebpOptions
  avif: sharp.AvifOptions
  jxl: sharp.JxlOptions
}

export default class ImageUtils {
    /**
     * Fixes incorrect image extensions. It must be correct to preview on mac.
     */
    public static fixFileExtensions = async (folder: string) => {
        const files = fs.readdirSync(folder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        for (const file of files) {
            let filepath = path.join(folder, file)
            if (fs.lstatSync(filepath).isDirectory()) continue
            const buffer = fs.readFileSync(filepath)
            const meta = await sharp(buffer, {limitInputPixels: false}).metadata()
            let ext = meta.format.replace("jpeg", "jpg")
            let newFile = `${path.basename(file, path.extname(file))}.${ext}`
            let newFilePath = path.join(folder, newFile)
            fs.renameSync(filepath, newFilePath)
        }
    }

    /**
     * Moves invalid image files.
     */
    public static moveInvalidImages = async (srcFolder: string, destFolder: string) => {
        const files = fs.readdirSync(srcFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        for (const file of files) {
            let filepath = path.join(srcFolder, file)
            if (fs.lstatSync(filepath).isDirectory()) continue
            const buffer = fs.readFileSync(filepath)
            try {
                await sharp(buffer, {limitInputPixels: false}).metadata()
            } catch {
                let destpath = path.join(destFolder, file)
                fs.renameSync(filepath, destpath)
            }
        }
    }

    /**
     * Copies images to the destination (unchanged)
     */
    public static copyImages = (sourceFolder: string, destFolder: string) => {
        const files = fs.readdirSync(sourceFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        for (const file of files) {
            let src = path.join(sourceFolder, file)
            if (fs.lstatSync(src).isDirectory()) continue
            let dest = path.join(destFolder, file)
            fs.copyFileSync(src, dest)
        }
    }

    /**
     * Moves images to the destination
     */
    public static moveImages = (sourceFolder: string, destFolder: string) => {
        const files = fs.readdirSync(sourceFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        for (const file of files) {
            let src = path.join(sourceFolder, file)
            if (fs.lstatSync(src).isDirectory()) continue
            let dest = path.join(destFolder, file)
            fs.renameSync(src, dest)
        }
    }

    /**
     * Resizes image down to a maximum width/height.
     */
    public static resizeImage = async (filepath: string, maxSize: number | {maxWidth: number, maxHeight: number} = 2000) => {
        let maxWidth = typeof maxSize === "number" ? maxSize : maxSize.maxWidth
        let maxHeight = typeof maxSize === "number" ? maxSize : maxSize.maxHeight
        let buffer = new Uint8Array(fs.readFileSync(filepath))
        const dim = await sharp(buffer).metadata()
        if (dim.width > maxWidth || dim.height > maxHeight) {
            buffer = await sharp(buffer)
            .resize(maxWidth, maxHeight, {fit: "inside"})
            .toBuffer().then((b) => new Uint8Array(b))
            fs.writeFileSync(filepath, buffer)
        }
        return filepath
    }

    /**
     * Transparent image check.
     */
    public static isTransparent = async (filepath: string) => {
        const image = sharp(filepath)
        const metadata = await image.metadata()
        if (!metadata.hasAlpha) return false

        const {data, info} = await image.ensureAlpha().raw().toBuffer({resolveWithObject: true})

        let counter = 0
        for (let i = 3; i < data.length; i += info.channels) {
            if (data[i] === 0) counter++
        }
        return counter > 100000
    }

    /**
     * Converts image to the specified format. Default is jpg for non-transparent and webp for transparent.
     */
    public static convertImage = async <T extends Formats>(filepath: string, format?: T, formatOptions?: FormatOptionMap[T],
        transparentFormat?: T, transparentFormatOptions?: FormatOptionMap[T]) => {
        let buffer = fs.readFileSync(filepath)
        let newBuffer = null as unknown as Buffer

        let targetFormat = format
        let targetOptions = formatOptions
        if (await this.isTransparent(filepath)) {
            if (transparentFormat) {
                targetFormat = transparentFormat
                targetOptions = transparentFormatOptions
            } else if (!format) {
                targetFormat = "webp" as T
                targetOptions = undefined
            }
        }
        if (!targetFormat) targetFormat = "jpg" as T

        switch(targetFormat) {
            case "jpg":
                newBuffer = await sharp(buffer).jpeg(targetOptions ?? {quality: 95, optimiseScans: true}).toBuffer()
                break
            case "png":
                newBuffer = await sharp(buffer).png(targetOptions ?? {compressionLevel: 7}).toBuffer()
                break
            case "webp":
                newBuffer = await sharp(buffer).webp(targetOptions ?? {quality: 90}).toBuffer()
                break
            case "avif":
                newBuffer = await sharp(buffer).avif(targetOptions ?? {quality: 80, effort: 2}).toBuffer()
                break
            case "jxl":
                newBuffer = await sharp(buffer).jxl(targetOptions ?? {quality: 90, effort: 4}).toBuffer()
                break
            default:
                newBuffer = buffer
        }

        let newFile = `${path.basename(filepath, path.extname(filepath))}.${targetFormat}`
        const newFilePath = path.join(path.dirname(filepath), newFile)
        fs.writeFileSync(filepath, newBuffer)
        fs.renameSync(filepath, newFilePath)
        return newFilePath
    }

    /**
     * Upscale image. Optionally copies unprocessed files (due to an error) to a folder.
     */
    public static upscaleImage = async (src: string, destFolder: string, 
        options?: Waifu2xOptions, unprocessedFolder: boolean = true) => {
        let dest = path.join(destFolder, path.basename(src))

        let target = src
        let isWebp = path.extname(src) === ".webp"
        let isAvif = path.extname(src) === ".avif"
        let isJxl = path.extname(src) === ".jxl"
        if (isWebp || isAvif || isJxl) {
            fs.copyFileSync(src, dest)
            target = await this.convertImage(dest, "png")
        }

        let result = await waifu2x.upscaleImage(target, destFolder, options ?? {rename: "", upscaler: "real-cugan", scale: 4})
        if (isWebp) {
            await this.convertImage(result, "webp")
        } else if (isAvif) {
            await this.convertImage(result, "avif")
        } else if (isJxl) {
            await this.convertImage(result, "jxl")
        }

        if (!fs.existsSync(dest) && unprocessedFolder) {
            let unprocfolder = path.join(path.dirname(destFolder), "unprocessed")
            if (!fs.existsSync(unprocfolder)) fs.mkdirSync(unprocfolder)
            fs.copyFileSync(src, path.join(unprocfolder, path.basename(src)))
        }
        return dest
    }

    /**
     * Processes an image folder with a custom chain of operations.
     */
    public static processImages = async (folder: string, 
        ...operations: Array<(file: string) => Promise<string>>) => {
        const files = fs.readdirSync(folder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        let i = 1
        for (const file of files) {
            console.log(`${i}/${files.length}  -> ${file}`)
            let src = path.join(folder, file)
            if (fs.lstatSync(src).isDirectory()) continue
            for (const operation of operations) {
                src = await operation(src)
            }
            i++
        }
    }

    /**
     * Shorthand process images with only a resize.
     */
    public static resizeImages = (folder: string, maxSize: number | {maxWidth: number, maxHeight: number} = 2000) => {
        return this.processImages(folder, 
            async (file) => this.resizeImage(file, maxSize)
        )
    }

    /**
     * Shorthand process images with only a conversion. 
     */
    public static convertImages = <T extends Formats>(folder: string, format = "jpg" as T, formatOptions?: FormatOptionMap[T], 
        transparentFormat = "webp" as T, transparentFormatOptions?: FormatOptionMap[T]) => {
        return this.processImages(folder, 
            async (file) => this.convertImage(file, format, formatOptions, transparentFormat, transparentFormatOptions)
        )
    }

    /**
     * Shorthand process images with only a upscale. 
     */
    public static upscaleImages = (sourceFolder: string, destFolder: string, 
        options?: Waifu2xOptions, unprocessedFolder: boolean = true) => {
        return this.processImages(sourceFolder, 
            async (file) => this.upscaleImage(file, destFolder, options, unprocessedFolder)
        )
    }

    /**
     * Splits up a folder into more manageable chunks.
     */
    public static splitFolder = (folder: string, maxAmount: number = 300) => {
        const files = fs.readdirSync(folder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)

        const chunks = Math.ceil(files.length / maxAmount)
        
        for (let i = 0; i < chunks; i++) {
            const chunkFiles = files.slice(i * maxAmount, (i + 1) * maxAmount)
            const chunkFolder = path.join(folder, `${i + 1}`)
            if (!fs.existsSync(chunkFolder)) fs.mkdirSync(chunkFolder)

            for (const file of chunkFiles) {
                const src = path.join(folder, file)
                const dest = path.join(chunkFolder, file)
                fs.renameSync(src, dest)
            }
        }
    }

    /**
     * Processes an image folder to be suitable to upload to moepictures.
     */
    public static moepicsProcess = async (folder: string) => {
        const original = path.join(folder, "original")
        const compressed = path.join(folder, "compressed")
        const upscaled = path.join(folder, "upscaled")
        if (!fs.existsSync(original)) fs.mkdirSync(original)
        if (!fs.existsSync(compressed)) fs.mkdirSync(compressed)
        if (!fs.existsSync(upscaled)) fs.mkdirSync(upscaled)

        this.moveImages(folder, original)
        this.copyImages(original, compressed)
        console.log("Compressing images...")
        await this.processImages(compressed, 
            async (file) => this.resizeImage(file),
            async (file) => this.convertImage(file)
        )
        console.log("Upscaling images...")
        await this.processImages(compressed, 
            async (file) => this.upscaleImage(file, upscaled),
            async (file) => this.convertImage(file, "avif")
        )

        this.splitFolder(compressed)
        this.splitFolder(upscaled)
    }

    /**
     * Adds the _p, _s, _g, or _c qualifier to images
     */
    public static changeQualifiers = (folder: string, qualifier: "p" | "s" | "g" | "c" = "p") => {
        const files = fs.readdirSync(folder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        for (const file of files) {
            const {name, ext} = path.parse(file)

            const match = name.match(/(_s|_p|_g|_c!?)(\d+)?$/)

            let newName = `${name}_${qualifier}0`
            if (match) {
                const num = match[2] ?? 0
                newName = name.replace(/(_s|_p|_g|_c!?)(\d+)?$/, `_${qualifier}${num}`);
            }

            const src = path.join(folder, file)
            const dest = path.join(folder, `${newName}${ext}`)
            fs.renameSync(src, dest)
        }
    }

    /**
     * Reverse searches the image to find danbooru post.
     */
    public static reverseImageSearch = async (filepath: string, minSimilarity = 75) => {
        const buffer = new Uint8Array(fs.readFileSync(filepath)).buffer

        const form = new FormData()
        form.append("file", new Blob([buffer], {type: "image/png"}))

        const html = await fetch("https://iqdb.org/", {method: "POST", body: form}).then((r) => r.text())
        const $ = cheerio.load(html)

        let result = {} as any
        let downloadLinks = [] as string[]
        let promises = [] as Promise<void>[]

        const appendDanbooru = async (link: string) => {
            result = await fetch(`${link}.json`).then((r) => r.json())
        }
        const appendZerochanDownload = async (link: string) => {
            const json = await fetch(`${link}?json`).then((r) => r.json())
            downloadLinks.push(json.full)
        }
        const appendGelbooruDownload = async (link: string) => {
            let baseURL = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&id=`
            const result = await fetch(`${baseURL}${link.match(/\d+/)?.[0]}`).then((r) => r.json())
            downloadLinks.push(result.post[0]?.file_url)
        }
        const appendSafebooruDownload = async (link: string) => {
            let baseURL = `https://safebooru.org//index.php?page=dapi&s=post&q=index&json=1&id=`
            const result = await fetch(`${baseURL}${link.match(/\d+/)?.[0]}`).then((r) => r.json())
            downloadLinks.push(result[0]?.file_url)
        }
        const appendYandereDownload = async (link: string) => {
            const result = await fetch(`https://yande.re/post.json?tags=id:${link.match(/\d+/)?.[0]}`).then((r) => r.json())
            downloadLinks.push(result[0]?.file_url)
        }
        const appendKonachanDownload = async (link: string) => {
            const result = await fetch(`https://konachan.com/post.json?tags=id:${link.match(/\d+/)?.[0]}`).then((r) => r.json())
            downloadLinks.push(result[0]?.file_url)
        }

        $("#pages > div").each((i, el) => {
            let link = ($(el).find("a").first().attr("href") || "").replace(/^\/\//, "http://").replace("http://", "https://")
            let link2 = ($(el).find("a").last().attr("href") || "").replace(/^\/\//, "http://").replace("http://", "https://")
            const textTds = $(el).find("td").filter((_, td) => $(td).children("img").length === 0)
                .map((_, td) => $(td).text().trim()).get()
            const similarity = parseFloat(textTds.find(text => /% similarity$/.test(text)) || "")

            if (similarity > minSimilarity) {
                if (link.includes("danbooru.donmai.us")) promises.push(appendDanbooru(link))

                if (link.includes("zerochan.net")) promises.push(appendZerochanDownload(link))
                if (link2.includes("gelbooru.com")) promises.push(appendGelbooruDownload(link))
                if (link2.includes("safebooru.org")) promises.push(appendSafebooruDownload(link))
                if (link.includes("yande.re")) promises.push(appendYandereDownload(link))
                if (link.includes("konachan.com")) promises.push(appendKonachanDownload(link))
            }
        })

        await Promise.allSettled(promises)
        if (result.id) {
            if (!result.file_url) result.file_url = downloadLinks[0]
        }
        return result
    }

    /**
     * Attempts to recover arbitrarily named posts from pixiv, or danbooru as fallback.
     */
    public static recoverFromPixiv = async (folder: string, pixivRefreshToken?: string, forceRevSearch?: boolean) => {
        const pixiv = await Pixiv.refreshLogin(pixivRefreshToken!)
        const originalFolder = path.join(folder, "original")
        const pixivFolder = path.join(folder, "pixiv")
        const twitterFolder = path.join(folder, "twitter")
        const otherFolder = path.join(folder, "other")
        const comicFolder = path.join(folder, "comic")
        const unrecoverableFolder = path.join(folder, "unrecoverable")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)

        this.moveImages(folder, originalFolder)

        const files = fs.readdirSync(originalFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)

        let i = 1
        for (const file of files) {
            console.log(`${i}/${files.length}  -> ${file}`)
            let pixivID = forceRevSearch ? "" : file.match(/^\d{5,}(?=$|_)/)?.[0]
            let danbooruPosts: any[] = []
            let isComic = false

            if (pixivID) {
                danbooruPosts = await fetch(`https://danbooru.donmai.us/posts.json?tags=pixiv_id%3A${pixivID}&limit=1000`).then((r) => r.json())
            } else {
                const danbooruPost = await this.reverseImageSearch(path.join(originalFolder, file))
                if (Object.keys(danbooruPost).length) danbooruPosts = [danbooruPost]
                if (danbooruPosts[0]?.source.includes("pximg.net") || danbooruPosts[0]?.source.includes("pixiv.net")) {
                    pixivID = path.basename(danbooruPosts[0].source).match(/\d+/)?.[0]
                }
            }

            if (danbooruPosts.length) {
                for (const json of danbooruPosts) {
                    if (json.tag_string.includes("comic")) isComic = true
                }
            }

            try {
                if (pixivID) {
                    let illust = await pixiv.illust.get(pixivID)
                    if (illust.width === 100 && illust.height === 100 && path.basename(illust.image_urls.medium)
                        .includes("limit_unknown")) throw new Error("bad illust")
                    let multiFolder = isComic ? comicFolder : pixivFolder
                    await pixiv.util.downloadIllust(illust, pixivFolder, "original", multiFolder)
                    i++
                    continue
                }
            } catch {}

            if (danbooruPosts.length) {
                for (const json of danbooruPosts) {
                    let filename = path.basename(json.source)
                    if (!filename.includes(".")) filename += ".png"
                    if (json.source.includes("pximg.net") || json.source.includes("pixiv.net")) {
                        filename = path.basename(json.source)
                    } else if (json.source.includes("twitter.com") || json.source.includes("x.com")) {
                        filename = `twitter_${filename}.${json.file_ext}`
                    }
                    const downloadLink = json.file_url
                    if (downloadLink) {
                        const buffer = await fetch(downloadLink).then((r) => r.arrayBuffer())
                        if (json.source.includes("twitter.com") || json.source.includes("x.com")) {
                            if (!fs.existsSync(twitterFolder)) fs.mkdirSync(twitterFolder)
                            let dest = path.join(twitterFolder, filename)
                            fs.writeFileSync(dest, new Uint8Array(buffer))
                        } else if (isComic) {
                            if (!fs.existsSync(comicFolder)) fs.mkdirSync(comicFolder)
                            let dest = path.join(comicFolder, filename)
                            fs.writeFileSync(dest, new Uint8Array(buffer))
                        } else if (json.source.includes("pximg.net") || json.source.includes("pixiv.net")) {  
                            if (!fs.existsSync(pixivFolder)) fs.mkdirSync(pixivFolder)
                            let dest = path.join(pixivFolder, filename)
                            fs.writeFileSync(dest, new Uint8Array(buffer))
                        } else {
                            if (!fs.existsSync(otherFolder)) fs.mkdirSync(otherFolder)
                            let dest = path.join(otherFolder, filename)
                            fs.writeFileSync(dest, new Uint8Array(buffer))
                        }
                    } else {
                        if (!fs.existsSync(unrecoverableFolder)) fs.mkdirSync(unrecoverableFolder)
                        let src = path.join(originalFolder, file)
                        let dest = path.join(unrecoverableFolder, file)
                        fs.copyFileSync(src, dest)
                    }
                }
            } else {
                if (!fs.existsSync(unrecoverableFolder)) fs.mkdirSync(unrecoverableFolder)
                let src = path.join(originalFolder, file)
                let dest = path.join(unrecoverableFolder, file)
                fs.copyFileSync(src, dest)
            }
            i++
        }
    }

    /**
     * Attempts to recover pixiv posts from saucenao
     */
    public static recoverFromSaucenao = async (folder: string, saucenaoKey?: string, pixivRefreshToken?: string) => {
        const pixiv = await Pixiv.refreshLogin(pixivRefreshToken!)
        const originalFolder = path.join(folder, "original")
        const pixivFolder = path.join(folder, "pixiv")
        const unrecoverableFolder = path.join(folder, "unrecoverable")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)

        this.moveImages(folder, originalFolder)

        const files = fs.readdirSync(originalFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)

        let i = 1
        for (const file of files) {
            console.log(`${i}/${files.length}  -> ${file}`)
            i++

            let buffer = fs.readFileSync(path.join(originalFolder, file))
            let pngBuffer = await sharp(buffer, {limitInputPixels: false})
                .resize(2000, 2000, {fit: "inside"}).png()
                .toBuffer()
            
            const form = new NodeFormData()
            form.append("db", "999")
            form.append("api_key", saucenaoKey!)
            form.append("output_type", 2)
            form.append("file", pngBuffer, {
                filename: `file.png`,
                contentType: "image/png"
            })

            let results = await axios.post("https://saucenao.com/search.php", form, {headers: form.getHeaders()}).then((r) => r.data.results)
            results = results.sort((a, b) => Number(b.header.similarity) - Number(a.header.similarity))
            results = results.filter((r) => Number(r.header.similarity) > 70)

            const pixivResults = results.filter((r) => r.header.index_id === 5)
            if (pixivResults.length) {
                let pixivID = pixivResults[0].data.pixiv_id
                try {
                    let illust = await pixiv.illust.get(pixivID)
                    if (illust.width === 100 && illust.height === 100 && path.basename(illust.image_urls.medium)
                        .includes("limit_unknown")) throw new Error("bad illust")
                    await pixiv.util.downloadIllust(illust, pixivFolder, "original")
                } catch {
                    if (!fs.existsSync(unrecoverableFolder)) fs.mkdirSync(unrecoverableFolder)
                    let src = path.join(originalFolder, file)
                    let dest = path.join(unrecoverableFolder, `${pixivID}${path.extname(file)}`)
                    fs.copyFileSync(src, dest)
                }
            } else {
                if (!fs.existsSync(unrecoverableFolder)) fs.mkdirSync(unrecoverableFolder)
                let src = path.join(originalFolder, file)
                let dest = path.join(unrecoverableFolder, file)
                fs.copyFileSync(src, dest)
            }
        }
    }

    /**
     * Attempts to filter AI images on a folder containing images from pixiv.
     */
    public static filterAIImages = async (folder: string, pixivRefreshToken?: string) => {
        const pixiv = await Pixiv.refreshLogin(pixivRefreshToken!)
        const originalFolder = path.join(folder, "original")
        const aiFolder = path.join(folder, "ai")
        const errorFolder = path.join(folder, "error")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)

        this.moveImages(folder, originalFolder)

        const files = fs.readdirSync(originalFolder).filter((f) => f !== ".DS_Store")
        .sort(new Intl.Collator(undefined, {numeric: true, sensitivity: "base"}).compare)
        let i = 1
        for (const file of files) {
            console.log(`${i}/${files.length}  -> ${file}`)
            let pixivID = file.match(/^\d{5,}(?=\.|_)/)?.[0]
            if (pixivID) {
                try {
                    let illust = await pixiv.illust.get(pixivID)
                    if (pixiv.util.isAI(illust)) {
                        if (!fs.existsSync(aiFolder)) fs.mkdirSync(aiFolder)
                        let src = path.join(originalFolder, file)
                        let dest = path.join(aiFolder, file)
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
}