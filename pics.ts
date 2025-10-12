import "dotenv/config"
import imageUtils from "./image-utils"

const start = async () => {
    console.log(await imageUtils.isTransparent("./downloads/a.png"))
}

start()