# TileViewer 

Tiled Image Viewer Client & Tile generator.

Tileviewer is a jQuery plugin that allows users to view stupendously large images (like 30k by 30k pixels or more) via HTML5 capable browser without having to download the whole image. User can zoom in & pan using a mouse similar to Google Map, and TileView only downloads parts of the image (tiles) that needs to be downloaded at varying zoom levels.

Tileviewer has a server side script (tile.py) which will split your original large image into many small (usually 256x256 pixels) pyramid-tiles and Tileviewer jQuery plugin will use AJAX to download them as needed.

## Installation 
In order to display your image via TileViewer, first you need to tile your images using tile.py (get it from the Download page) on your web server.

```
yum install GraphicsMagick 
./tile.py my_big_image.jpg /var/www/html/tiles/my_big_image
```

First argument is your image that you'd like to tile (image file type could be anything as long as it's supported by GraphicsMagick library), and second argument is the directory where you want to store your tiles. It needs to be exposed via your web server.

You can then create use TileViewer plugin to render your image by doing something like following.

```
<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="https://raw.github.com/soichih/TileViewer/master/web/style.css" type="text/css"/>
<title>TileViewer Demo</title>
</head>
<body>
<h1>TileView Demo</h1>
<div id="eso1208a" class="tileviewer"></div>
<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js"></script>
<script src="https://raw.github.com/soichih/TileViewer/master/web/jquery.mousewheel.js"></script>
<script src="https://raw.github.com/soichih/TileViewer/master/web/jquery.tileviewer.js"></script>
<script>
$("#eso1208a").tileviewer({ src: "eso1208a", magnifier: true }).width("700").height("500"); 
</script>
<footer><a href="https://sites.google.com/site/tileviewer/">Home</a></footer>
</body>
</html>
```

Please note that, due to XSS restriction, you have to host your images on the same domain that you are hosting this page.

Contact me if you have any problem / comments, etc. at soichih@gmail.com
