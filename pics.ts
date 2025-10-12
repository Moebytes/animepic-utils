import "dotenv/config"
import imageUtils from "./image-utils"

const start = async () => {
    console.log(imageUtils.changeQualifiers("./downloads", "g"))
}

start()