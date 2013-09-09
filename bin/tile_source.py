#!/usr/bin/python

from PIL import Image, ImageDraw
import sys,math,os,json

tilesize = 256
reduction_factor = 2 ##reduce output imgage size by half (we don't need hires weight map)

#input argument
source_list=sys.argv[1]
width=int(sys.argv[2])/reduction_factor
height=int(sys.argv[3])/reduction_factor
output_png=sys.argv[4]+"/source.png"
output_tiledir=sys.argv[4]+"/json_tiles"
output_infojson=sys.argv[4]+"/info.json"

#calculate col/row counts, and maximum level based on image size
cols=int(math.ceil(width/tilesize))+1
rows=int(math.ceil(height/tilesize))+1
if width > height:
    max_size = width
else:
    max_size = height
max_level = int(math.ceil(math.log(max_size/tilesize)/math.log(2)))

#create array of arrays
tiles = {}
for tile_id in range(cols*rows):
    tiles[tile_id] = [] 

#load object.csv and start parsing
img = Image.new("RGBA", (width, height))
draw = ImageDraw.Draw(img)
f = file(source_list, "r")
for line in f.readlines():
    #skip comment line
    if line[0] == "#":
        continue

    tokens = line.strip().split()
    info = {
        "object": tokens[0],
        "flux_auto": float(tokens[1]),
        "fluxerr_auto": float(tokens[2]),
        "mag_auto": float(tokens[3]),
        "magerr_auto": float(tokens[4]),
        "fwhm_image": float(tokens[7])
    }
    flux_auto = tokens[1]
    x = float(tokens[5])/reduction_factor
    y = float(tokens[6])/reduction_factor

    #limit size of r
    r = int(float(tokens[7])/reduction_factor);
    if r < 3:
        r = 3
    if r > 20:
        r = 20

    #reverse x/y
    x = width - x
    y = height - y

    x_off = int(x % tilesize);
    y_off = int(y % tilesize);

    #find tile id
    tile_id = int(x/tilesize) + int(y/tilesize)*cols
    tiles[tile_id].append({"type": "circle-pop", "x": x_off + r, "y": y_off, "r": r, "info": info})

    draw.ellipse((x-r,y-r,x+r,y+r), fill=(0,255,0))
f.close()
img.save(output_png, "PNG")

#output json tiles
os.mkdir(output_tiledir)
for tile_id in range(cols*rows):
    f = open(output_tiledir+"/"+str(tile_id)+".json", "w")
    f.write(json.dumps(tiles[tile_id]))
    f.close()

#outpu json info
levels = {"0": "json"}
for level in range(1,max_level):
    levels[str(level)] = "png"
infojson = {"width": width, "height": height, "tilesize": tilesize, "levels": levels}
f = open(output_infojson, "w")
f.write(json.dumps(infojson))
f.close()

