import fs from "fs"
import path from "path"
import sharp from "sharp"
import waifu2x, {Waifu2xOptions} from "waifu2x"

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
     * Copies images to the destination (unchanged)
     */
    public static copyImages = (sourceFolder: string, destFolder: string) => {
        const files = fs.readdirSync(sourceFolder).filter((f) => f !== ".DS_Store")
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
}