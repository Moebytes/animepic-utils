## Animepic Utils

Some utilities for processing anime images. (However I guess it'll work for any images).

The primary function is `processImages` that accepts a folder of images, and then a variable 
amount of processing functions that will be applied to every image in the folder. The processing functions 
should take the current file parameter and return the path to the output, this is then fed back as the 
"file" argument to the next function in the chain. See below for an example of using it.

```ts
import imageUtils from "animepic-utils"

await imageUtils.processImages(folder, 
    async (file) => this.resizeImage(file),
    async (file) => this.convertImage(file),
    async (file) => this.upscaleImage(file, upscaledFolder)
)
```

We already have functions for resizing, conversion, and upscaling, but you can continue to write your 
own if you wish. Apart from image processing, there is the `fixFileExtensions` function that will correct 
the file extensions of all the images in a folder. On macOS, the extensions have to be correct in order for 
the file to preview in finder, so a png cannot have the jpg extension.

```ts
import imageUtils from "animepic-utils"

await imageUtils.fixFileExtensions(folder)
```

Lastly, the function `moepicsProcess` will takes a folder of anime images and will generate the compressed 
and upscaled versions that are suitable to upload to my website, moepictures.moe. 

```ts
import imageUtils from "animepic-utils"

await imageUtils.moepicsProcess(folder)
```