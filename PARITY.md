# MagickImage API Parity

> Auto-generated from `magick-image.ts` and codebase analysis.
> Tracks which `IMagickImage` methods/properties are used in WASMagick and which are not.

## Overview

| Category | Used | Not Used | Total |
|----------|------|----------|-------|
| Properties | 7 | 46 | 53 |
| Methods | 35 | 81 | 116 |
| **Total** | **42** | **127** | **169** |

**Coverage: 25% (42/169)**

---

## USED Methods & Properties

### Properties

| Property | Type | Description | Usage |
|----------|------|-------------|-------|
| `backgroundColor` | `IMagickColor` | Gets or sets the background color of the image. | Set before `extent()` to define the fill color for canvas expansion. (`magick-process.ts:79`, `useMagick.svelte.ts:845`) |
| `borderColor` | `IMagickColor` | Gets or sets the border color of the image. | Set before `border()` to define the color of the added border. (`magick-process.ts:73`, `useMagick.svelte.ts:834`) |
| `colorSpace` | `ColorSpace` | Gets or sets the color space of the image. | Set when user selects a non-RGB color space (e.g. Gray, CMYK). (`magick-process.ts:151`, `useMagick.svelte.ts:974`) |
| `format` | `MagickFormat` | Gets or sets the format of the image. | Read after processing to detect original image format. (`useMagick.svelte.ts:801`) |
| `height` | `number` | Gets the height of the image. | Read for output dimensions and as fallback for `extent()`. (`magick-process.ts:83,281`, `useMagick.svelte.ts:849,1184`) |
| `quality` | `number` | Gets or sets the JPEG/MIFF/PNG compression level (default 75). | Set to user-specified quality before encoding output. (`magick-process.ts:278`, `useMagick.svelte.ts:1179`) |
| `width` | `number` | Gets the width of the image. | Read for output dimensions and as fallback for `extent()`. (`magick-process.ts:82,280`, `useMagick.svelte.ts:848,1183`) |

---

### Geometry

| Method | Signature | Description | Usage |
|--------|-----------|-------------|-------|
| `resize()` | `(width: number, height: number): void` | Resize image in terms of its pixel size. | Resizes the image to user-specified dimensions. (`magick-process.ts:61`, `useMagick.svelte.ts:810`) |
| `rotate()` | `(degrees: number): void` | Rotate image clockwise by specified number of degrees. | Rotates the image by the user-specified angle. (`magick-process.ts:65`, `useMagick.svelte.ts:816`) |
| `flip()` | `(): void` | Flip image (reflect each scanline in the vertical direction). | Mirrors the image vertically (top-bottom). (`magick-process.ts:69`, `useMagick.svelte.ts:827`) |
| `flop()` | `(): void` | Flop image (reflect each scanline in the horizontal direction). | Mirrors the image horizontally (left-right). (`magick-process.ts:68`, `useMagick.svelte.ts:822`) |
| `border()` | `(size: number): void` | Add a border to the image. | Adds a colored border around the image. (`magick-process.ts:74`, `useMagick.svelte.ts:835`) |
| `extent()` | `(width: number, height: number, gravity: Gravity): void` | Extend the image as defined by the width and height. | Expands or crops the canvas to user-specified dimensions with gravity anchor. (`magick-process.ts:81-85`, `useMagick.svelte.ts:847-851`) |
| `deskew()` | `(threshold: Percentage, autoCrop: boolean): number` | Removes skew from the image. Skew is an artifact that occurs in scanned images because of the camera being misaligned, imperfections in the scanning or surface, or simply because the paper was not placed completely flat when scanned. | Corrects skewed scanned documents using Hough transform. (`magick-process.ts:89`, `useMagick.svelte.ts:862-865`) |
| `crop()` | `(width: number, height: number, gravity: Gravity): void` | Crop image (subregion of original image). | Crops the image to user-specified dimensions with gravity anchor. Falls back to full image width/height when only one dimension is set. (`magick-process.ts:75`, `useMagick.svelte.ts:856`) |
| `trim()` | `(): void` | Trim edges that are the background color from the image. | Trims uniform-color edges from the image. (`magick-process.ts:106`, `useMagick.svelte.ts:898`) |
| `shave()` | `(leftRight: number, topBottom: number): void` | Shave pixels from image edges. | Removes pixels symmetrically from the edges, clamped to half the image size. (`magick-process.ts:108-112`, `useMagick.svelte.ts:903-916`) |

---

### Color / Adjustment

| Method | Signature | Description | Usage |
|--------|-----------|-------------|-------|
| `modulate()` | `(brightness: Percentage, saturation: Percentage, hue: Percentage): void` | Modulate percent brightness, saturation and hue of an image. | Adjusts brightness, saturation, and hue via the color panel. (`magick-process.ts:97-101`, `useMagick.svelte.ts:878-882`) |
| `brightnessContrast()` | `(brightness: Percentage, contrast: Percentage): void` | Changes the brightness and/or contrast of an image. It converts the brightness and contrast parameters into slope and intercept and calls a polynomical function to apply to the image. | Adjusts contrast (brightness always 0). (`magick-process.ts:105`, `useMagick.svelte.ts:892-895`) |
| `normalize()` | `(): void` | Normalize image (increase contrast by normalizing the pixel values to span the full range of color values). | Normalizes the image contrast across the full intensity range. (`magick-process.ts:108`, `useMagick.svelte.ts:901`) |
| `autoLevel()` | `(): void` | Adjusts the levels of a particular image channel by scaling the minimum and maximum values to the full quantum range. | Automatically adjusts levels to span the full dynamic range. (`magick-process.ts:109`, `useMagick.svelte.ts:907`) |
| `autoOrient()` | `(): void` | Adjusts an image so that its orientation is suitable for viewing. | Automatically rotates based on EXIF orientation data. (`magick-process.ts:110`, `useMagick.svelte.ts:913`) |
| `level()` | `(blackPoint: Percentage, whitePoint: Percentage, gamma: number, channels: Channels): void` | Adjust the levels of the image by scaling the colors falling between specified white and black points to the full available quantum range. | Adjusts black/white point and gamma per channel (All, Red, Green, Blue). (`magick-process.ts:120`, `useMagick.svelte.ts:932`) |
| `threshold()` | `(percentage: Percentage, channels: Channels): void` | Threshold image. | Applies binary threshold at user-specified percentage. (`magick-process.ts:130-133`, `useMagick.svelte.ts:946-949`) |
| `sigmoidalContrast()` | `(contrast: number, midpoint: number, channels: Channels): void` | Adjust the image contrast with a non-linear sigmoidal contrast algorithm. | Applies S-curve contrast adjustment with configurable midpoint. (`magick-process.ts:142-146`, `useMagick.svelte.ts:961-965`) |
| `negate()` | `(channels: Channels): void` | Negate colors in image for the specified channel. | Inverts image colors on RGB channels (negative effect). (`magick-process.ts:181`, `useMagick.svelte.ts:1017`) |
| `grayscale()` | `(method: PixelIntensityMethod): void` | Converts the colors in the image to gray. | Converts to grayscale using Rec709Luminance method. (`magick-process.ts:166`, `useMagick.svelte.ts:997`) |

---

### Effects / Filters

| Method | Signature | Description | Usage |
|--------|-----------|-------------|-------|
| `blur()` | `(radius: number, sigma: number): void` | Blur image with specified blur factor. | Applies Gaussian blur with user-specified radius. (`magick-process.ts:155`, `useMagick.svelte.ts:980`) |
| `sharpen()` | `(radius: number, sigma: number): void` | Sharpen pixels in image. | Sharpens the image with user-specified radius. (`magick-process.ts:160`, `useMagick.svelte.ts:988`) |
| `adaptiveSharpen()` | `(radius: number, sigma: number): void` | Adaptively sharpens the image by sharpening more intensely near image edges and less intensely far from edges. | Sharpens with edge-aware processing using user-specified radius and sigma. (`magick-process.ts:173`, `useMagick.svelte.ts:1033`) |
| `adaptiveBlur()` | `(radius: number, sigma: number): void` | Adaptive-blur image with specified blur factor. | Blurs with edge-aware processing using user-specified radius and sigma. (`magick-process.ts:177`, `useMagick.svelte.ts:1045`) |
| `sepiaTone()` | `(threshold: Percentage): void` | Applies a special effect to the image, similar to the effect achieved in a photo darkroom by sepia toning. | Applies sepia tone effect at user-specified threshold. (`magick-process.ts:169`, `useMagick.svelte.ts:1001`) |
| `charcoal()` | `(radius: number, sigma: number): void` | Charcoal effect image (looks like charcoal sketch). | Simulates charcoal drawing effect. (`magick-process.ts:174,176`, `useMagick.svelte.ts:1008,1011`) |
| `cannyEdge()` | `(radius: number, sigma: number, lower: Percentage, upper: Percentage): void` | Uses a multi-stage algorithm to detect a wide range of edges in images. | Performs Canny edge detection. (`magick-process.ts:186-191`, `useMagick.svelte.ts:1023-1028`) |
| `oilPaint()` | `(radius: number): void` | Oilpaint image (image looks like oil painting). | Applies oil painting effect with user-specified brush radius. (`magick-process.ts:195`, `useMagick.svelte.ts:1038`) |
| `solarize()` | `(factor: Percentage): void` | Solarize image (similar to effect seen when exposing a photographic film to light during the development process). | Partial tone reversal effect. (`magick-process.ts:198`, `useMagick.svelte.ts:1043`) |
| `bilateralBlur()` | `(width: number, height: number, intensitySigma: number, spatialSigma: number): void` | Applies a non-linear, edge-preserving, and noise-reducing smoothing filter. | Edge-preserving blur with spatial and intensity sigma parameters. (`magick-process.ts:201-206`, `useMagick.svelte.ts:1048-1053`) |

---

### Quantize / CLUT

| Method | Signature | Description | Usage |
|--------|-----------|-------------|-------|
| `clut()` | `(image: IMagickImage, method: PixelInterpolateMethod, channels: Channels): void` | Apply a color lookup table (CLUT) to the image. | Applies color grading presets (warm, cool, vintage, etc.) generated by `luts.ts`. (`magick-process.ts:213`, `useMagick.svelte.ts:1071`) |
| `quantize()` | `(settings?: QuantizeSettings): MagickErrorInfo \| null` | Quantize image (reduce number of colors). | Reduces color palette with configurable dither, tree depth, and color space. (`magick-process.ts:226`, `useMagick.svelte.ts:1093`) |

---

### I/O

| Method | Signature | Description | Usage |
|--------|-----------|-------------|-------|
| `write()` | `(format: MagickFormat, func: (data: Uint8Array) => void): void` | Writes the image to a byte array. | Encodes the processed image to the target format (WebP, PNG, JPEG, etc.). (`magick-process.ts:283`, `useMagick.svelte.ts:1186`) |
| `strip()` | `(): void` | Strips an image of all profiles and comments. | Removes EXIF/ICC metadata when "Strip metadata" is enabled. (`magick-process.ts:273`, `useMagick.svelte.ts:1172`) |
| `getPixels()` | `(func: (pixels: IPixelCollection) => T): T` | Get a pixel collection that can be used to read or modify the pixels of this image. | Accesses pixel data when building CLUT images in `luts.ts`. (`luts.ts:111`) |

---

### Static Methods

| Method | Signature | Description | Usage |
|--------|-----------|-------------|-------|
| `MagickImage.create()` | `(color: IMagickColor, width: number, height: number): IMagickImage` | Creates a new `IMagickImage` instance. | Creates a blank 256x1 CLUT image filled with a color in `luts.ts`. (`luts.ts:110`) |

---

## NOT USED Methods & Properties

### Properties (Not Used)

| Property | Type | Description |
|----------|------|-------------|
| `animationDelay` | `number` | Gets or sets the time in 1/100ths of a second which must expire before splaying the next image in an animated sequence. |
| `animationIterations` | `number` | Gets or sets the number of iterations to loop an animation (e.g. Netscape loop extension) for. |
| `animationTicksPerSecond` | `number` | Gets or sets the ticks per seconds for the animation delay. |
| `artifactNames` | `ReadonlyArray<string>` | Gets the names of the artifacts. |
| `attributeNames` | `ReadonlyArray<string>` | Gets the names of the attributes. |
| `baseHeight` | `number` | Gets the height of the image before transformations. |
| `baseWidth` | `number` | Gets the width of the image before transformations. |
| `blackPointCompensation` | `boolean` | Gets or sets a value indicating whether black point compensation should be used. |
| `boundingBox` | `IMagickGeometry \| null` | Gets the smallest bounding box enclosing non-border pixels. The current fuzz value is used when discriminating between pixels. |
| `channelCount` | `number` | Gets the number of channels that the image contains. |
| `channels` | `ReadonlyArray<PixelChannel>` | Gets the channels of the image. |
| `chromaticity` | `ChromaticityInfo` | Gets or sets the chromaticity of the image. |
| `classType` | `ClassType` | Gets or sets the image class (DirectClass or PseudoClass). |
| `colorFuzz` | `Percentage` | Gets or sets the distance where colors are considered equal. |
| `colormapSize` | `number` | Gets or sets the color map size. |
| `colorType` | `ColorType` | Gets or sets the color type of the image. |
| `comment` | `string \| null` | Gets or sets the comment text of the image. |
| `compose` | `CompositeOperator` | Gets or sets the composition operator to be used when composition is implicitly used. |
| `compression` | `CompressionMethod` | Gets the compression method of the image. |
| `density` | `Density` | Gets or sets the vertical and horizontal resolution in pixels of the image. |
| `depth` | `number` | Gets or sets the depth (bits allocated to red/green/blue components). |
| `endian` | `Endian` | Gets or sets the endianness for image formats which support endian-specific options. |
| `fileName` | `string \| null` | Gets the original file name of the image (only available if read from disk). |
| `filterType` | `FilterType` | Gets or sets the filter to use when resizing image. |
| `gamma` | `number` | Gets the gamma level of the image. |
| `gifDisposeMethod` | `GifDisposeMethod` | Gets or sets the gif disposal method. |
| `hasAlpha` | `boolean` | Gets or sets a value indicating whether the image supports transparency (alpha channel). |
| `interlace` | `Interlace` | Gets or sets the type of interlacing to use. |
| `interpolate` | `PixelInterpolateMethod` | Gets or sets the pixel color interpolate method to use. |
| `isOpaque` | `boolean` | Gets a value indicating whether none of the pixels in the image have an alpha value other than OpaqueAlpha. |
| `label` | `string \| null` | Gets or sets the label of the image. |
| `matteColor` | `IMagickColor` | Gets or sets the matte color. |
| `metaChannelCount` | `number` | Gets or sets the number of meta channels that the image contains. |
| `orientation` | `Orientation` | Gets or sets the photo orientation of the image. |
| `onProgress` | `(event: ProgressEvent) => void` | Event that will be raised when progress is reported by this image. |
| `onWarning` | `(event: WarningEvent) => void` | Event that will be raised when a warning is raised by ImageMagick. |
| `page` | `IMagickGeometry` | Gets or sets the preferred size and location of an image canvas. |
| `profileNames` | `ReadonlyArray<string>` | Gets the names of the profiles. |
| `renderingIntent` | `RenderingIntent` | Gets or sets the type of rendering intent. |
| `settings` | `MagickSettings` | Gets the settings for this instance. |
| `signature` | `string \| null` | Gets the signature of this image. |
| `totalColors` | `number` | Gets the number of colors in the image. |
| `virtualPixelMethod` | `VirtualPixelMethod` | Gets or sets the virtual pixel method. |

---

### Geometry (Not Used)

| Method | Signature | Description |
|--------|-----------|-------------|
| `adaptiveResize()` | `(width: number, height: number): void` | Resize using mesh interpolation. It works well for small resizes of less than +/- 50% of the original image size. |
| `adaptiveThreshold()` | `(width: number, height: number, channels: Channels): void` | Local adaptive threshold image. |
| `chop()` | `(geometry: MagickGeometry): void` | Chop image (remove vertical or horizontal subregion of image) using the specified geometry. |
| `chopHorizontal()` | `(x: number, width: number): void` | Chop image (remove vertical or horizontal subregion of image). |
| `chopVertical()` | `(y: number, height: number): void` | Chop image (remove vertical or horizontal subregion of image). |
| `cropToTiles()` | `(geometry: IMagickGeometry, func): T` | Creates tiles of the current image in the specified dimension. |
| `liquidRescale()` | `(width: number, height: number): void` | Rescales image with seam carving. |
| `resetPage()` | `(): void` | Resets the page property of this image. |
| `roll()` | `(x: number, y: number): void` | Roll image (rolls image vertically and horizontally). |
| `splice()` | `(geometry: IMagickGeometry, gravity: Gravity): void` | Splice the background color into the image. |
| `thumbnail()` | `(width: number, height: number): void` | Resize image to thumbnail size and remove all the image profiles except the icc/icm profile. |

---

### Color / Adjustment (Not Used)

| Method | Signature | Description |
|--------|-----------|-------------|
| `addNoise()` | `(noiseType: NoiseType, channels: Channels): void` | Add noise to image with the specified noise type. |
| `autoGamma()` | `(channels: Channels): void` | Extracts the 'mean' from the image and adjust the image to try make set its gamma appropriately. |
| `autoThreshold()` | `(method: AutoThresholdMethod): void` | Automatically selects a threshold and replaces each pixel in the image with a black pixel if the image intensity is less than the selected threshold otherwise white. |
| `blackThreshold()` | `(threshold: Percentage, channels: Channels): void` | Forces all pixels below the threshold into black while leaving all pixels at or above the threshold unchanged. |
| `clahe()` | `(xTiles: number, yTiles: number, numberBins: number, clipLimit: number): void` | A variant of adaptive histogram equalization in which the contrast amplification is limited. |
| `contrast()` | `(): void` | Contrast image (enhance intensity differences in image). |
| `contrastStretch()` | `(blackPoint: Percentage, whitePoint: Percentage, channels: Channels): void` | A simple image enhancement technique that attempts to improve the contrast in an image by 'stretching' the range of intensity values it contains. |
| `cycleColormap()` | `(amount: number): void` | Displaces an image's colormap by a given number of positions. |
| `evaluate()` | `(channels: Channels, operator: EvaluateOperator, value: number): void` | Apply an arithmetic or bitwise operator to the image pixel quantums. |
| `gammaCorrect()` | `(gamma: number, channels: Channels): void` | Gamma correct image. |
| `gaussianBlur()` | `(radius: number, sigma: number, channels: Channels): void` | Gaussian blur image. |
| `inverseContrast()` | `(): void` | Inverse contrast image (diminish intensity differences in image). |
| `inverseLevel()` | `(blackPoint: Percentage, whitePoint: Percentage, gamma: number, channels: Channels): void` | Applies the reversed level operation to just the specific channels specified. |
| `inverseSigmoidalContrast()` | `(contrast: number, midpoint: number, channels: Channels): void` | Adjust the image contrast with an inverse non-linear sigmoidal contrast algorithm. |
| `linearStretch()` | `(blackPoint: Percentage, whitePoint: Percentage): void` | Discards any pixels below the black point and above the white point and levels the remaining pixels. |
| `modulate()` | *(brightness-only overload)* `(brightness: Percentage): void` | Modulate percent brightness of an image. |
| `motionBlur()` | `(radius: number, sigma: number, angle: number): void` | Motion blur image with specified blur factor. |
| `negateGrayScale()` | `(channels: Channels): void` | Negate the grayscale colors in image. |
| `whiteThreshold()` | `(threshold: Percentage, channels: Channels): void` | Forces all pixels below the threshold into white while leaving all pixels at or above the threshold unchanged. |

---

### Effects / Filters (Not Used)

| Method | Signature | Description |
|--------|-----------|-------------|
| `affineTransform()` | `(affineMatrix: IDrawableAffine): void` | Applies an affine transformation to the image. |
| `alpha()` | `(value: AlphaAction): void` | Applies the specified alpha action. |
| `annotate()` | `(text: string, boundingArea: MagickGeometry, gravity: Gravity, angle: number): void` | Annotate using specified text, bounding area, and placement gravity. (Note: annotation is done via `Drawables` API instead.) |
| `bilateralBlur()` | *(2-arg overload)* `(width: number, height: number): void` | Applies a non-linear, edge-preserving, and noise-reducing smoothing filter. |
| `blueShift()` | `(factor: number): void` | Simulate a scene at nighttime in the moonlight. |
| `colorAlpha()` | `(color: IMagickColor): void` | Sets the alpha channel to the specified color. |
| `morphology()` | `(settings: MorphologySettings): void` | Applies a kernel to the image according to the given morphology settings. |
| `shadow()` | `(x: number, y: number, sigma: number, alpha: Percentage): void` | Simulate an image shadow. |
| `vignette()` | `(radius: number, sigma: number, x: number, y: number): void` | Softens the edges of the image in vignette style. |
| `wave()` | `(method: PixelInterpolateMethod, amplitude: number, length: number): void` | Map image pixels to a sine wave. |

---

### Compositing / Distortion (Not Used)

| Method | Signature | Description |
|--------|-----------|-------------|
| `compare()` | `(image: IMagickImage, metric: ErrorMetric): number` | Returns the distortion based on the specified metric. |
| `composite()` | `(image: IMagickImage, compose: CompositeOperator, point: Point): void` | Compose an image onto another at specified offset using the specified algorithm. |
| `compositeGravity()` | `(image: IMagickImage, gravity: Gravity, compose: CompositeOperator): void` | Compose an image onto another using the specified algorithm and gravity. |
| `connectedComponents()` | `(settings: ConnectedComponentsSettings): ConnectedComponent[]` | Determines the connected-components of the image. |
| `distort()` | `(method: DistortMethod, params: number[]): void` | Distorts an image using various distortion methods, by mapping color lookups of the source image to a new destination image. |

---

### I/O / Profiles / Metadata (Not Used)

| Method | Signature | Description |
|--------|-----------|-------------|
| `clone()` | `(func: SyncImageCallback<T>): T` | Creates a clone of the current image. |
| `cloneArea()` | `(geometry: MagickGeometry, func: SyncImageCallback<T>): T` | Creates a clone of the current image with the specified geometry. |
| `colorDecisionList()` | `(colorCorrectionCollection: string): void` | Applies the color decision list from the specified ASC CDL data. |
| `determineBitDepth()` | `(channels: Channels): number` | Determines the bit depth (bits allocated to red/green/blue components). |
| `draw()` | `(...drawables: IDrawable[]): void` | Draw on image using one or more drawables. (Note: `Drawables.draw(image)` is used instead.) |
| `floodFill()` | `(color: IMagickColor, x: number, y: number, target: IMagickColor): void` | Floodfill pixels matching color (within fuzz factor) of target pixel(x,y) with replacement alpha value. |
| `formatExpression()` | `(expression: string): string \| null` | Formats the specified expression (ImageMagick escape syntax). |
| `getArtifact()` | `(name: string): string \| null` | Returns the value of the artifact with the specified name. |
| `getAttribute()` | `(name: string): string \| null` | Returns the value of the attribute with the specified name. |
| `getColormapColor()` | `(index: number): IMagickColor \| null` | Returns the color at colormap position index. |
| `getColorProfile()` | `(): IColorProfile \| null` | Retrieve the color profile from the image. |
| `getProfile()` | `(name: string): IImageProfile \| null` | Retrieve a named profile from the image. |
| `getWriteMask()` | `(func: (mask: IMagickImage \| null) => T): T` | Gets the associated write mask of the image. |
| `hasProfile()` | `(name: string): boolean` | Gets a value indicating whether a profile with the specified name already exists on the image. |
| `histogram()` | `(): Map<string, number>` | Creates a color histogram. |
| `inverseFloodFill()` | `(color: IMagickColor, x: number, y: number, target: IMagickColor): void` | Floodfill pixels matching color with inversion. |
| `inverseOpaque()` | `(target: IMagickColor, fill: IMagickColor): void` | Changes any pixel that does not match the target with the color defined by fill. |
| `inverseTransparent()` | `(color: IMagickColor): void` | Add alpha channel to image, setting pixels that don't match the specified color to transparent. |
| `opaque()` | `(target: IMagickColor, fill: IMagickColor): void` | Changes any pixel that matches target with the color defined by fill. |
| `perceptualHash()` | `(colorSpaces: ReadonlyArray<ColorSpace>): IPerceptualHash` | Returns the perceptual hash of this image. |
| `ping()` | `(array: ByteArray, settings?: MagickReadSettings): void` | Reads only metadata and not the pixel data. |
| `read()` | `(array: ByteArray, settings?: MagickReadSettings): void` | Read single image frame. |
| `readFromCanvas()` | `(canvas: HTMLCanvasElement, settings?: CanvasRenderingContext2DSettings): void` | Read single image frame from canvas. |
| `removeArtifact()` | `(name: string): void` | Removes the artifact with the specified name. |
| `removeAttribute()` | `(name: string): void` | Removes the attribute with the specified name. |
| `removeProfile()` | `(name: string): void` | Remove a named profile from the image. |
| `removeWriteMask()` | `(): void` | Removes the associated write mask of the image. |
| `separate()` | `(channels: Channels, func): T` | Separates the channels from the image and returns it as grayscale images. |
| `setArtifact()` | `(name: string, value: string): void` | Inserts the artifact with the specified name and value into the artifact tree of the image. |
| `setAttribute()` | `(name: string, value: string): void` | Inserts the attribute with the specified name and value into the artifact tree of the image. |
| `setCompression()` | `(compression: CompressionMethod): void` | Sets the compression of the image. |
| `setProfile()` | `(name: string, data: ByteArray): void` | Set the specified profile of the image. |
| `setWriteMask()` | `(image: IMagickImage): void` | Sets the associated write mask of the image. |
| `statistics()` | `(channels: Channels): IStatistics` | Returns the image statistics. |
| `transformColorSpace()` | `(target: IColorProfile): boolean` | Transforms the image from the colorspace of the source profile to the target profile. |
| `toString()` | `(): string` | Returns a string that represents the current image. |
| `writeToCanvas()` | `(canvas: HTMLCanvasElement, settings?: CanvasRenderingContext2DSettings): void` | Writes the image to the specified canvas. |

---

## Processing Pipeline

All used methods are called from two near-identical processing pipelines:

1. **Worker path** (`src/lib/magick-process.ts`) - Runs in a Web Worker via `magick.worker.ts`
2. **Main-thread path** (`src/lib/useMagick.svelte.ts`) - Fallback when local fonts are active or worker is unavailable

The processing order in both pipelines is:

```
1. resize
2. rotate
3. flop / flip
4. crop
5. trim
6. shave
7. border (sets borderColor)
8. extent (sets backgroundColor)
9. deskew
10. modulate (brightness/saturation/hue)
11. brightnessContrast
12. normalize
13. autoLevel
14. autoOrient
15. level (per channel: All, Red, Green, Blue)
16. threshold
17. sigmoidalContrast
18. colorSpace (property set)
19. blur
20. sharpen
21. adaptiveSharpen
22. adaptiveBlur
23. effects (grayscale / sepiaTone / charcoal / negate / cannyEdge / oilPaint / solarize / bilateralBlur)
24. clut
25. quantize
26. drawables (annotation via Drawables API, not image.annotate())
27. strip
28. write (encode to format)
```

---

## Notes

- The `annotate()` method exists in the interface but WASMagick uses the `Drawables` API (`draws.draw(image)`) for text annotation instead, which offers more control over font, gravity, affine transforms, and stroke.
- The `draw()` method on `MagickImage` exists but is not called directly; the `Drawables` class manages the drawing pipeline.
- The `read()` method on `MagickImage` is not called directly; `ImageMagick.read()` static method is used instead.
- The `getPixels()` method is only used in `luts.ts` for CLUT generation, not in the main processing pipeline.
