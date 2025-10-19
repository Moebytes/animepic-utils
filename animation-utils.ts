import waifu2x, {Waifu2xOptions} from "waifu2x"
import util from "./utils"
import fs from "fs"
import path from "path"
import JSZip from "jszip"

export default class AnimationUtils {
    /**
     * Extracts a zip file into a directory.
     */
    public static extractZip = async (zipPath: string, outputDir: string) => {
        const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))

        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, {recursive: true})
        
        for (const [filename, file] of Object.entries(zip.files)) {
            const destPath = path.join(outputDir, filename)

            if (file.dir) {
                fs.mkdirSync(destPath, {recursive: true})
            } else {
                fs.mkdirSync(path.dirname(destPath), {recursive: true})
                const content = await file.async("nodebuffer")
                fs.writeFileSync(destPath, content)
            }
        }
    }

    /**
     * Compresses a directory into a zip file.
     */
    public static compressFolder = async (folder: string, zipPath: string) => {
        const zip = new JSZip()

        const addFolderToZip = (zip: JSZip, folder: string, baseFolder = "") => {
            const files = fs.readdirSync(folder)

            for (const name of files) {
                const filepath = path.join(folder, name)

                if (fs.statSync(filepath).isDirectory()) {
                    const zipFolder = zip.folder(path.join(baseFolder, name))
                    addFolderToZip(zipFolder!, filepath)
                } else {
                    const fileData = fs.readFileSync(filepath)
                    zip.file(path.join(baseFolder, name), fileData)
                }
            }
        }

        addFolderToZip(zip, folder)
        const zipData = await zip.generateAsync({type: "nodebuffer", compression: "DEFLATE"})
        fs.writeFileSync(zipPath, zipData)
    }

    /**
     * Upscales a ugoira zip file.
     */
    public static upscaleUgoira = async (src: string, options?: Waifu2xOptions) => {
        let basename = path.basename(src, path.extname(src))
        let extractPath = path.join(path.dirname(src), basename)
        await this.extractZip(src, extractPath)

        const originalFolder = path.join(extractPath, "original")
        const upscaledFolder = path.join(extractPath, "upscaled")
        if (!fs.existsSync(originalFolder)) fs.mkdirSync(originalFolder)
        if (!fs.existsSync(upscaledFolder)) fs.mkdirSync(upscaledFolder)
        
        util.image.moveImages(extractPath, originalFolder)
        fs.copyFileSync(path.join(originalFolder, "animation.json"), path.join(upscaledFolder, "animation.json"))

        await util.image.processImages(originalFolder, 
            async (file) => path.extname(file) !== ".json" ? util.image.upscaleImage(file, upscaledFolder, options) : file,
            async (file) => path.extname(file) !== ".json" ? util.image.convertImage(file) : file
        )
        this.removeLocalDirectory(originalFolder)
        util.image.moveImages(upscaledFolder, extractPath)
        this.removeLocalDirectory(upscaledFolder)

        await this.compressFolder(extractPath, `${path.join(path.dirname(src), basename)}2x.zip`)
        this.removeLocalDirectory(extractPath)
    }

    private static removeLocalDirectory = (dir: string) => {
        if (!fs.existsSync(dir)) return
        fs.readdirSync(dir).forEach((file) => {
            const current = path.join(dir, file)
            if (fs.lstatSync(current).isDirectory()) {
                this.removeLocalDirectory(current)
            } else {
                fs.unlinkSync(current)
            }
        })
        try {
            fs.rmdirSync(dir)
        } catch (error) {
            console.log(error)
        }
    }
}