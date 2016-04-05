#!/usr/bin/env python

#import numpy
import os, sys
#import Image, ImageDraw
import math

import PIL
from PIL import Image
from optparse import OptionParser
import itertools
import json


if __name__ == "__main__":

    # Read the command line options
    parser = OptionParser()
    parser.add_option("", "--levels", dest="levels",
                      help="Number of levels",
                      default=10, type=int)
    parser.add_option("-s", "--tilesize", dest="tilesize",
                      help="size of an individual size",
                      default=512, type=int)
    parser.add_option("-o", "--outdir", dest="outdir",
                      help="output directory",
                      default=".",
                      )
    parser.add_option("-t", "--type", dest="filetype",
                      help="file type (e.g. png, jpg)",
                      default="png",
                      )
    (options, cmdline_args) = parser.parse_args()


    infile = cmdline_args[0]
    print options.outdir

    #
    # open input image
    #
    img = Image.open(infile)

    size = img.getbbox()
    print "Original image dimensions: %d x %d pixels" % (size[2], size[3])

    # 
    # Write a small json file to encapsulate information about the frame
    #
    json_data = {
        "width": size[2],
        "height": size[3],
        "tilesize": options.tilesize,
        }
    main_tiles_dir = "%s/main_tiles" % (options.outdir)
    json_filename = "%s/info.json" % (main_tiles_dir)
    try:
        os.makedirs(main_tiles_dir)
    except OSError:
        pass
    with open(json_filename, 'w') as outfile:
        json.dump(json_data, outfile)


    for level in range(options.levels):

        # get image size
        size = img.getbbox()

        # create tiles
        n_tiles_x = int(math.ceil(float(size[2]) / options.tilesize))
        n_tiles_y = int(math.ceil(float(size[3]) / options.tilesize))
        # print n_tiles_x, n_tiles_y
        print "Working on tiles for level %d (%dx%d pixels --> %d x %d tiles)" % (
            level, size[2], size[3], n_tiles_x, n_tiles_y)


        # Create output directory
        level_dir = "%s/main_tiles/level%d" % (options.outdir, level)
        try:
            os.makedirs(level_dir)
        except OSError:
            pass

            
        tile_number = 0
        for ty, tx in itertools.product(range(n_tiles_y), range(n_tiles_x)):
            # print tx, ty

            _x = (tx+1)*options.tilesize
            _y = (ty+1)*options.tilesize
            tile_area = (tx*options.tilesize,
                         ty*options.tilesize,
                         _x if _x < size[2] else size[2],
                         _y if _y < size[3] else size[3])
            img_cutout = img.crop(tile_area)
            # print tx, ty, tile_area

            tile_filename = "%s/%d.%s" % (level_dir, tile_number, options.filetype)
            # print tile_filename
            img_cutout.save(tile_filename)
            tile_number += 1

        # image.crop((left,upper,right,lower)
        

        # shrink down by factor 2
        new_x = int(size[2] / 2.)
        new_y = int(size[3] / 2.)
        new_size = (new_x, new_y)
        # print new_size
        try:
            img = img.resize(new_size, resample=PIL.Image.LANCZOS)
        except AttributeError:
            img = img.resize(new_size)
            
        # img.save("tile_level_%d.png" % (level))

        if (n_tiles_x * n_tiles_y <= 1):
            print "only a single tile image left, skipping all further levels!"
            break

        pass 
