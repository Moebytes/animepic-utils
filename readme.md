<div align="left">
  <p>
    <img src="https://github.com/Moebytes/animepic-utils/blob/main/title.png?raw=true" width="700" />
  </p>
  <p>
    <a href="https://nodei.co/npm/animepic-utils/"><img src="https://nodei.co/npm/animepic-utils.png" /></a>
  </p>
</div>

Some utilities for processing anime images. (However I guess it'll work for any images).

### Pixiv Refresh Token

To obtain your pixiv refresh token for the methods that require it, you can use the pixivauth.py script 
from PixivPy. I included it in the base of the github repository.

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

### Anime specific

The function `recoverFromPixiv` takes a folder of arbitrarily named images and attempts to recover 
the original images from pixiv, or danbooru as a fallback. Files which are unrecoverable 
will be put into an "unrecoverable" folder, usually because it was deleted and not archived anywhere.

```ts
import imageUtils from "animepic-utils"

await imageUtils.recoverFromPixiv(folder, process.env.PIXIV_REFRESH_TOKEN)
```

The `reverseImageSearch` function reverse searches the image on iqdb and returns the found danbooru post, 
since usually this is the site with the most info.

```ts
import imageUtils from "animepic-utils"

await imageUtils.reverseImageSearch(imagePath)
```

The `filterAIImages` function attempts to filter out AI images from a folder containing pixiv images. If 
you have images that aren't on pixiv, you will have to use your best judgement...

```ts
import imageUtils from "animepic-utils"

await imageUtils.filterAIImages(folder, process.env.PIXIV_REFRESH_TOKEN)
```

The function `moepicsProcess` takes a folder of anime images and will generate the compressed 
and upscaled versions that are suitable to upload to my website, https://moepictures.moe. 

```ts
import imageUtils from "animepic-utils"

await imageUtils.moepicsProcess(folder)
```

We also use filename qualifiers in order to group related images. Images can be grouped together 
as variations, grouped separately as groups, added as child posts to the first image (_c0), or 
uploaded completely separately. This comes from most posts on pixiv already using the `_p0` (page number) 
qualifier in the names.

You can change the qualifiers for images in a folder with the `changeQualifiers` method.

```ts
import imageUtils from "animepic-utils"

await imageUtils.changeQualifiers(folder, "g")
```

These are the full list of qualifiers:

- `_s` or none - Uploads images seperately
- `_p` - Joins images together into one post as variations
- `_g` - Uploads images seperately but adds them to the same group
- `_g!` - Adds the image as a *variation* to the previous group post
- `_c` - Adds images as child posts to the first in the set (`_c0`)
- `_c!` - Adds the image as a *variation* to the previous child post