import "dotenv/config"
import imageUtils from "./image-utils"

const start = async () => {
    console.log(imageUtils.addQualifier("./downloads", "g"))
}

start()