/* 

TileViewer HTML5 client

    Version: 2.0.1

    This plugin is tested with following dependencies
    * JQuery 1.3.2
    * Brandon Aaron's (http://brandonaaron.net) mousewheel jquery plugin 3.0.3

The MIT License

    Copyright (c) 2011 Soichi Hayashi (https://sites.google.com/site/soichih/)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

*/

(function($){
var methods = {
    ///////////////////////////////////////////////////////////////////////////////////
    // Initializes if it's not already initialized
    init: function (options) {

        var defaults = {
            src: "http://soichi.odi.iu.edu/tileviewer/tiles/last_launch", //just a sample image
            empty: "#6f6", //color of empty (loading) tile - if no subtile is available
            width: 400, //canvas width - not image width
            height: 300, //canvas height - not image height
            zoom_sensitivity: 32, 
            thumbnail: true,//display thumbnail
            magnifier: false,//display magnifier
            debug: true,
            pixel: true,
            magnifier_view_size: 200, //view size
            magnifier_view_area: 32, //pixel w/h sizes to zoom
            graber_size: 12, //size of the grabber area
            maximum_pixelsize: 1,//set this to >1 if you want to let user to zoom image after reaching its original resolution (also consider using magnifier..)
            thumb_depth: 2 //level depth when thumb nail should appear
        };

        var layer_defaults = {
        };
        
        return this.each(function() {
            var $this = $(this);
            options = $.extend(defaults, options);//override defaults with options
            $this.data("options", options);

            ///////////////////////////////////////////////////////////////////////////////////
            // Now we can start initializing
            //If the plugin hasn't been initialized yet..
            var view = $this.data("view");
            if(!view) {
                var view = {
                    layers: [
                        //you can add as many layers as you want.. layers[0] is master
                    ],
                    canvas: document.createElement("canvas"),
                    status: document.createElement("p"),
                    mode: null, //current mouse left button mode (pan, sel2d, sel1d, etc..)
                    pan: {
                        //pan destination
                        xdest: null,//(pixel pos)
                        ydest: null,//(pixel pos)
                        leveldest: null,
                    },
                    select: {
                        x: null,
                        y: null,
                        width: null,
                        height: null
                    },
                    magnifier_canvas: document.createElement("canvas"),
                    //current mouse position (client pos)
                    xnow: null,
                    ynow: null,
                    mousedown: false,
                    drawmsec: null, //milli seconds tool to draw a frame
                    needdraw: false, //flag used to request for frameredraw 

                    ///////////////////////////////////////////////////////////////////////////////////
                    // internal functions
                    draw: function() {
                        var start = new Date().getTime();
                        view.needdraw = false;

                        var ctx = view.canvas.getContext("2d");
                        view.canvas.width = $this.width();//clear canvas

                        if(view.layers.length > 0)  {
                            for(var i=0; i<view.layers.length; i++) {
                                var layer = view.layers[i];
                                if(layer.enable) {
                                    view.draw_tiles(layer, ctx);
                                }
                            }
                            if(options.magnifier) {
                                view.draw_magnifier(ctx);
                            }
                            var master_layer = view.layers[0];
                            if(master_layer.info) {
                                view.draw_mode(master_layer, ctx);
                            }
                        }
                        
                        //calculate framerate
                        var end = new Date().getTime();
                        //var time = end - start;
                        //view.framerate = Math.round(1000/time);
                        view.drawmsec = end-start;

                        view.update_status();
                    },

                    draw_mode: function(layer, ctx) {
                        switch(view.mode) {
                        case "pan":
                            if(options.thumbnail) {
                                //only draw thumbnail if we are zoomed in far enough
                                if(layer.info._maxlevel - layer.level > options.thumb_depth) {
                                    view.draw_thumb(layer, ctx);
                                }
                            }
                            break;
                        case "select_1d":
                            view.draw_select_1d(ctx);
                            break;
                        case "select_2d":
                            view.draw_select_2d(ctx);
                            break;
                        }
                    },

                    update_status: function() {

                        if(options.debug) {
                            if(view.layers.length > 0) {
                                var html = "";

                                var layer = view.layers[0]; //use master layer
                                if(layer.info) {
                                    var pixel_pos = view.client2pixel(layer, view.xnow, view.ynow);
                                    html += "<p>draw msec: " + view.drawmsec+ 
                                        "<br>x:" + pixel_pos.x + 
                                        "<br>y:" + pixel_pos.y + "</p>";
                                }

                                for(var i=0; i<view.layers.length; i++) {
                                    var layer = view.layers[i];
                                    if(layer.info) {
                                        html += "<p>layer: " + layer.id +
                                            "<br>width: " + layer.info.width + 
                                            "<br>height: " + layer.info.height + 
                                            "<br>maxlevel: " + layer.info._maxlevel +
                                            "<br>level:" + Math.round((layer.level + layer.info.tilesize/layer.tilesize-1)*100)/100 + 
                                                " (tsize:"+Math.round(layer.tilesize*100)/100+")"+
                                            "<br>images loading: " + layer.loader.loading + 
                                            "<br>request queue: " + layer.loader.queue.length + 
                                            "<br>tiles in dict: " + layer.loader.tile_count + 
                                            "</p>"
                                    }
                                }
                                $(view.status).html(html);
                            }
                        } else {
                            $(view.status).empty();
                        }
                    },

                    draw_tiles: function(layer, ctx) {
                        //display tiles
                        var xmin = Math.max(0, Math.floor(-layer.xpos/layer.tilesize));
                        var ymin = Math.max(0, Math.floor(-layer.ypos/layer.tilesize));
                        var xmax = Math.min(layer.xtilenum, Math.ceil((view.canvas.clientWidth-layer.xpos)/layer.tilesize));
                        var ymax = Math.min(layer.ytilenum, Math.ceil((view.canvas.clientHeight-layer.ypos)/layer.tilesize));
                        for(var y = ymin; y < ymax; y++) {
                            for(var x  = xmin; x < xmax; x++) {
                                view.draw_tile(layer, ctx,x,y);
                            }
                        }
                    },

                    draw_thumb: function(layer, ctx) {
                        /*
                        //set shadow
                        ctx.shadowOffsetX = 3;
                        ctx.shadowOffsetY = 3;
                        ctx.shadowBlur    = 4;
                        ctx.shadowColor   = 'rgba(0,0,0,1)';
                        */

                        //draw thumbnail image
                        ctx.drawImage(layer.thumb, 0, 0, layer.thumb.width, layer.thumb.height);

                        //draw current view
                        var rect = view.get_viewpos(layer);
                        var factor = layer.thumb.height/layer.info.height;
                        ctx.strokeStyle = '#f00'; 
                        ctx.lineWidth   = 1;
                        ctx.strokeRect(rect.x*factor, rect.y*factor, rect.width*factor, rect.height*factor);
                    },

                    draw_tile: function(layer, ctx,x,y) {
                        var tileid = x + y*layer.xtilenum;
                        var url = layer.src+"/level"+layer.level+"/"+tileid+".png";
                        var img = layer.tiles[url];

                        var dodraw = function() {
                            var xsize = layer.tilesize;
                            var ysize = layer.tilesize;
                            if(x == layer.xtilenum-1) {
                                xsize = (layer.tilesize/layer.info.tilesize)*layer.tilesize_xlast;
                            }
                            if(y == layer.ytilenum-1) {
                                ysize = (layer.tilesize/layer.info.tilesize)*layer.tilesize_ylast;
                            }
                            if($.browser.mozilla) {
                                //firefox can't draw sub-pixel image (yet).. adjust it..
                                ctx.drawImage(img, Math.floor(layer.xpos+x*layer.tilesize), Math.floor(layer.ypos+y*layer.tilesize),    
                                    Math.ceil(xsize),Math.ceil(ysize));
                            } else {
                                ctx.drawImage(img, layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize,ysize);
                            }
                            img.access_timestamp = new Date().getTime();//update last access timestamp
                        }

                        if(img == null) {
                            view.loader_request(layer, url);
                        } else {
                            if(img.loaded) {
                                //good.. we have the image.. dodraw
                                dodraw(); 
                                return;
                            } else if(!img.loading) {
                                //not loaded yet ... re-request using the same image
                                view.loader_request(layer, url, img);
                            }
                        }
                        view.loader_process(layer);

                        //meanwhile .... draw subtile instead
                        var xsize = layer.tilesize;
                        var ysize = layer.tilesize;
                        if(x == layer.xtilenum-1) {
                            xsize = (layer.tilesize/layer.info.tilesize)*layer.tilesize_xlast;
                        }
                        if(y == layer.ytilenum-1) {
                            ysize = (layer.tilesize/layer.info.tilesize)*layer.tilesize_ylast;
                        }
                        //look for available subtile of the highest quaility
                        var down = 1;
                        var factor = 1;
                        while(layer.level+down <= layer.info._maxlevel) {
                            factor <<=1;
                            var xtilenum_up = Math.ceil(layer.info.width/Math.pow(2,layer.level+down)/layer.info.tilesize);
                            var subtileid = Math.floor(x/factor) + Math.floor(y/factor)*xtilenum_up;
                            var url = layer.src+"/level"+(layer.level+down)+"/"+subtileid+".png";
                            var img = layer.tiles[url];
                            if(img && img.loaded) {
                                //crop the source section
                                var half_tilesize = layer.info.tilesize/factor;
                                var sx = (x%factor)*half_tilesize;
                                var sy = (y%factor)*half_tilesize;
                                var sw = half_tilesize;
                                if(x == layer.xtilenum-1) sw = layer.tilesize_xlast/factor;
                                var sh = half_tilesize;
                                if(y == layer.ytilenum-1) sh = layer.tilesize_ylast/factor;
                                if($.browser.mozilla) {
                                    //firefox can't draw sub-pixel image .. adjust it..
                                    ctx.drawImage(img, sx, sy, sw, sh, 
                                        Math.floor(layer.xpos+x*layer.tilesize), Math.floor(layer.ypos+y*layer.tilesize), 
                                        Math.ceil(xsize),Math.ceil(ysize));
                                } else {
                                    ctx.drawImage(img, sx, sy, sw, sh, 
                                        layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize,ysize);
                                }
                                img.access_timestamp = new Date().getTime();
                                return;
                            }
                            //try another level
                            down++;
                        }

                        //console.log("subtile miss on layer:" + layer.src);
                        /* let's not do anything - I needed while debugging mostly
                        //nosubtile available.. draw empty rectangle as the last resort
                        ctx.fillStyle = options.empty;
                        ctx.fillRect(layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize, ysize);
                        */
                    },

                    loader_request: function(layer, url, img) {
                        if(img == undefined) {
                            //new image -- create
                            var img = new Image();
                            img.loaded = false;
                            img.loading = false;
                            img.level_loaded_for = layer.level;
                            img.request_src = url;
                            img.timestamp = new Date().getTime();
                            img.onload = function() {
                                this.loaded = true;
                                this.loading = false;
                                if(this.level_loaded_for == layer.level) {
                                    //ideally, I'd like to just draw the tile that got loaded,
                                    //but since I now support layering, I need to redraw the whole thing..
                                    //This means that tons of unnecessary image request will be made whenever
                                    //a lot of tiles are loaded simultanously
                                    view.needdraw = true;
                                }
                                layer.loader.loading--;
                                view.loader_process(layer);
                                //console.log(img.src + " loaded");
                            };
                            layer.tiles[url] = img; //register in dictionary
                            layer.loader.tile_count++;
                            //console.log("requesting " + url + " on " + layer.master);
                        }

                        //remove if already requested (so that I can add it back at the top)
                        for(id in layer.loader.queue) {
                            var request = layer.loader.queue[id];
                            if(request === img) {
                                layer.loader.queue = layer.loader.queue.splice(id, 1);
                                break;
                            }
                        } 
                        layer.loader.queue.push(img);
                        return img;
                    },
                    loader_process: function(layer) {
                        //if we can load more image, load it
                        while(layer.loader.queue.length > 0 && layer.loader.loading < layer.loader.max_loading) {
                            var img = layer.loader.queue.pop();
                            if(img.loaded == false && img.loading == false) {
                                img.src = img.request_src;
                                layer.loader.loading++;
                                img.loading = true;
                            }
                        }

                        //if we have too many requests, shift old ones out.
                        while(layer.loader.queue.length >= layer.loader.max_queue) {
                            var img = layer.loader.queue.shift();
                        }

                        //if we have too many images in the tiles ... remove last accessed image
                        while(layer.loader.tile_count >= layer.loader.max_tiles) {
                            var oldest_img = null;
                            for (var url in layer.tiles) {
                                img = layer.tiles[url];
                                if(img.loaded == true && (oldest_img == null || img.timestamp < oldest_img.timestamp)) {
                                    oldest_img = img;
                                }
                            }
                            if(oldest_img != null) {
                                delete layer.tiles[oldest_img.src];
                                layer.loader.tile_count--;
                            }
                        }
                    },

                    draw_magnifier:  function(ctx) {
                        //grab magnifier image
                        var mcontext = view.magnifier_canvas.getContext("2d");
                        var marea = ctx.getImageData(
                            view.xnow-options.magnifier_view_area/2, 
                            view.ynow-options.magnifier_view_area/2, 
                            options.magnifier_view_area,
                            options.magnifier_view_area);
                        mcontext.putImageData(marea, 0,0);//draw to canvas so that I can zoom it up

                        //display on the bottom left corner
                        ctx.drawImage(view.magnifier_canvas, 0, view.canvas.clientHeight-options.magnifier_view_size, options.magnifier_view_size, options.magnifier_view_size);
                    },

                    draw_select_1d: function(ctx) {

        /*
                        ctx.shadowOffsetX = 1;
                        ctx.shadowOffsetY = 1;
                        ctx.shadowBlur    = 2;
                        ctx.shadowColor   = 'rgba(0,0,0,0.5)';
        */ 
                        //draw line..
                        ctx.beginPath();
                        ctx.moveTo(view.select.x, view.select.y);
                        ctx.lineTo(view.select.x + view.select.width, view.select.y + view.select.height);
                        ctx.strokeStyle = "#0c0";
                        ctx.lineWidth = 3;
                        ctx.stroke();

                        //draw grabbers & line between
                        ctx.beginPath();
                        ctx.arc(view.select.x, view.select.y,options.graber_size/2,0,Math.PI*2,false);
                        ctx.arc(view.select.x+view.select.width, view.select.y+view.select.height,options.graber_size/2,0,Math.PI*2,false);
                        ctx.fillStyle = "#0c0";
                        ctx.fill();
                    },

                    draw_select_2d: function(ctx) {
        /*
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;
                        ctx.shadowBlur    = 2;
                        ctx.shadowColor   = 'rgba(0,0,0,0.5)';
        */
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.shadowBlur    = 0;
                        ctx.shadowColor   = 'rgba(0,0,0,0)';
                        ctx.strokeStyle = '#0c0'; 
                        ctx.lineWidth   = 2;
                        ctx.fillStyle = '#0c0';

                        //draw box
                        ctx.strokeRect(view.select.x, view.select.y, view.select.width, view.select.height);

                        //draw grabbers
                        ctx.beginPath();
                        ctx.arc(view.select.x, view.select.y, options.graber_size/2, 0, Math.PI*2, false);//topleft
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(view.select.x+view.select.width, view.select.y, options.graber_size/2, 0, Math.PI*2, false);//topright
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(view.select.x, view.select.y+view.select.height, options.graber_size/2, 0, Math.PI*2, false);//bottomleft
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(view.select.x+view.select.width, view.select.y+view.select.height, options.graber_size/2, 0, Math.PI*2, false);//bottomright
                        ctx.fill();

                    },

                    recalc_viewparams: function(layer) {
                        var factor = Math.pow(2,layer.level);

                        //calculate number of tiles on current level
                        layer.xtilenum = Math.ceil(layer.info.width/factor/layer.info.tilesize);
                        layer.ytilenum = Math.ceil(layer.info.height/factor/layer.info.tilesize);

                        //calculate size of the last tile
                        layer.tilesize_xlast = layer.info.width/factor%layer.info.tilesize;
                        layer.tilesize_ylast = layer.info.height/factor%layer.info.tilesize;
                        if(layer.tilesize_xlast == 0) layer.tilesize_xlast = layer.info.tilesize;
                        if(layer.tilesize_ylast == 0) layer.tilesize_ylast = layer.info.tilesize;
                    },

                    //get current pixel coordinates of the canvas window
                    get_viewpos: function(layer) {
                        var factor = Math.pow(2, layer.level)*layer.info.tilesize/layer.tilesize;
                        return {
                            x: -layer.xpos*factor,
                            y: -layer.ypos*factor,
                            width: view.canvas.clientWidth*factor,
                            height: view.canvas.clientHeight*factor
                        };
                    },

                    //calculate pixel position based on client x/y
                    client2pixel: function(layer, client_x, client_y) {
                        var factor = Math.pow(2,layer.level) * layer.info.tilesize / layer.tilesize;
                        var pixel_x = Math.round((client_x - layer.xpos)*factor);
                        var pixel_y = Math.round((client_y - layer.ypos)*factor);
                        return {x: pixel_x, y: pixel_y};
                    },

                    //calculate pixel potision on the center
                    center_pixelpos: function(layer) {
                        return view.client2pixel(layer, view.canvas.clientWidth/2, view.canvas.clientHeight/2);
                    },

                    change_zoom: function(delta, x, y) {

                        var layer = view.layers[0];
                        if(!layer.info) return;//master not loaded yet

                        //don't let it shrink too much
                        if(layer.level == layer.info._maxlevel-1 && layer.tilesize+delta < layer.info.tilesize/2) return false;
                        //don't let overzoom
                        if(layer.level == 0 && layer.tilesize+delta > layer.info.tilesize*options.maximum_pixelsize) return false;

                        //*before* changing tilesize, adjust offset so that we will zoom into where the cursor is
                        var dist_from_x0 = x - layer.xpos;
                        var dist_from_y0 = y - layer.ypos;
                    
                        layer.xpos -= dist_from_x0/layer.tilesize*delta;
                        layer.ypos -= dist_from_y0/layer.tilesize*delta;

                        layer.tilesize += delta;

                        //adjust level
                        if(layer.tilesize > layer.info.tilesize) { //level down
                            if(layer.level != 0) {
                                layer.level--;
                                layer.tilesize /= 2; //we can't use bitoperation here.. need to preserve floating point
                                view.recalc_viewparams(layer);
                            }
                        }
                        if(layer.tilesize < layer.info.tilesize/2) { //level up
                            if(layer.level != layer.info._maxlevel) {
                                layer.level++;
                                layer.tilesize *= 2; //we can't use bitoperation here.. need to preserve floating point
                                view.recalc_viewparams(layer);
                            }
                        }

                        //sub-layers just use master's pos,tilesize - adjusted by their max level
                        //if sub-layer reaches its max zoom (level0), stay on level0 and keep expanding tile
                        for(var i=1; i<view.layers.length; i++) {
                            var sub_layer = view.layers[i];
                            if(!sub_layer.info) continue; //not loaded yet
                            sub_layer.xpos = layer.xpos;
                            sub_layer.ypos = layer.ypos;
                            sub_layer.level = layer.level - (layer.info._maxlevel - sub_layer.info._maxlevel);
                            sub_layer.tilesize = layer.tilesize;
                            if(sub_layer.level < 0) {
                                sub_layer.tilesize *= Math.pow(2,-sub_layer.level);
                                sub_layer.level = 0;
                            }
                            view.recalc_viewparams(sub_layer);
                        }
                    },

                    pan: function() {
                        var layer = view.layers[0];

                        var factor = Math.pow(2,layer.level)*layer.info.tilesize/layer.tilesize;
                        var xdest_client = view.pan.xdest/factor + layer.xpos;
                        var ydest_client = view.pan.ydest/factor + layer.ypos;
                        var center = view.center_pixelpos(layer);
                        var dx = center.x - view.pan.xdest;
                        var dy = center.y - view.pan.ydest;
                        var dist = Math.sqrt(dx*dx + dy*dy);

                        //Step 1) if destination is not in client view - zoom out until we do (or we can't zoom out anymore)
                        if(layer.level != layer.info._maxlevel && 
                            (xdest_client < 0 || ydest_client < 0 || xdest_client > view.canvas.clientWidth || ydest_client > view.canvas.clientHeight)) {
                            view.change_zoom(-5, view.canvas.clientWidth/2 + dx/dist*factor*50, view.canvas.clientHeight/2 + dy/dist*factor*50);
                        } else {
                            //Step 2a) Pan to destination
                           if(dist >= factor) {
                                layer.xpos += dx / factor / 10;
                                layer.ypos += dy / factor / 10;
                            }

                            //Step 2b) Also, zoom in/out until destination level is reached
                            var current_level = layer.level + layer.info.tilesize/layer.tilesize-1;
                            var level_dist = Math.abs(view.pan.leveldest - current_level);
                            if(level_dist >= 0.1) {
                                var dzoom = 4;
                                if(current_level < view.pan.leveldest) dzoom = -dzoom;
                                view.change_zoom(dzoom, xdest_client*2 - view.canvas.clientWidth/2, ydest_client*2 - view.canvas.clientHeight/2);
                            }

                            if(dist < factor && level_dist < 0.1) {
                                //reached destination
                                view.pan.xdest = null;
                            }
                        }
                        view.needdraw = true;
                    },

                    inside: function(xt,yt,x,y,w,h) {
                        if(xt > x && xt < x + w && yt > y && yt < y + h) return true;
                        return false;
                    },

                    hittest_select_1d: function(x,y) {
                        if(view.inside(x,y, 
                            view.select.x-options.graber_size/2, 
                            view.select.y-options.graber_size/2,
                            options.graber_size, options.graber_size)) return "topleft";
                        if(view.inside(x,y,
                            view.select.x-options.graber_size/2+view.select.width, 
                            view.select.y-options.graber_size/2+view.select.height,
                            options.graber_size, options.graber_size)) return "bottomright";
                         return null;
                    },

                    hittest_select_2d: function(x,y) {
                        if(view.inside(x,y, 
                            view.select.x-options.graber_size/2, 
                            view.select.y-options.graber_size/2,
                            options.graber_size, options.graber_size)) return "topleft";
                        if(view.inside(x,y, 
                            view.select.x-options.graber_size/2, 
                            view.select.y-options.graber_size/2,
                            options.graber_size, options.graber_size)) return "topleft";
                        if(view.inside(x,y, 
                            view.select.x-options.graber_size/2+view.select.width, 
                            view.select.y-options.graber_size/2, 
                            options.graber_size, options.graber_size)) return "topright";
                        if(view.inside(x,y,
                            view.select.x-options.graber_size/2, 
                            view.select.y-options.graber_size/2+view.select.height,
                            options.graber_size, options.graber_size)) return "bottomleft";
                        if(view.inside(x,y,
                            view.select.x-options.graber_size/2+view.select.width, 
                            view.select.y-options.graber_size/2+view.select.height,
                            options.graber_size, options.graber_size)) return "bottomright";
                        if(view.inside(x,y, 
                            view.select.x, view.select.y,
                            view.select.width, view.select.height)) return "inside";
                         return null;
                    },

                    addlayer: function(id, src, enable) {
                        var layer = {
                            //json.info will be loaded here (static information about the image)
                            info: null, 
                            src: src,
                            id: id,
                            enable: false,

                            //current view offset - not absolute pixel offset
                            xpos: 0,
                            ypos: 0,

                            //number of tiles on the current level
                            xtilenum: null,
                            ytilenum: null,

                            //current tile level/size (size is usually 128-256)
                            level: null, 
                            tilesize: null,

                            thumb: null, //thumbnail image

                            //tile loader
                            loader: {
                                loading: 0, //actual number of images that are currently loaded
                                max_loading: 6, //max number of image that can be loaded simultaneously
                                max_queue: 20, //max number of images that can be queued to be loaded
                                queue: [], //FIFO queue for requested images
                                tile_count: 0, //number of tiles in tile dictionary (not all of them are actually loaded)
                                max_tiles: 200 //max number of images that can be stored in tiles dictionary
                            },
                            tiles: []//tiles dictionary 
                        };
                        view.layers.push(layer);

                        //load info.json to master layer
                        $.ajax({
                            url: src+"/info.json",
                            dataType: "json",
                            success: function(data) {
                                layer.info = data;
                                layer.enable = enable;

                                //calculate metadata
                                var v1 = Math.max(layer.info.width, layer.info.height)/layer.info.tilesize;
                                layer.info._maxlevel = Math.ceil(Math.log(v1)/Math.log(2));

                                //set initial level/size to fit the entire view
                                var min = Math.min(view.canvas.width, view.canvas.height)/layer.info.tilesize; //number of tiles that can fit
                                layer.level = layer.info._maxlevel - Math.floor(min) - 1;
                                layer.tilesize = layer.info.tilesize/2;

                                //center image
                                var factor = Math.pow(2,layer.level) * layer.info.tilesize / layer.tilesize;
                                layer.xpos = view.canvas.clientWidth/2-layer.info.width/2/factor;
                                layer.ypos = view.canvas.clientHeight/2-layer.info.height/2/factor;

                                //cache level0 image (so that we don't have to use the green rect too long..) and use it as thumbnail
                                var thumb_url = src+"/level"+layer.info._maxlevel+"/0.png";
                                layer.thumb = view.loader_request(layer, thumb_url);
                                view.loader_process(layer);

                                view.recalc_viewparams(layer);
                                view.needdraw = true;
                            }
                        });
                    }
                };//view definition
                $this.data("view", view);

                //setup views
                $this.addClass("tileviewer");
                $(view.canvas).css("background-color", "#222");

                $(view.canvas).css("width", "100%");
                $(view.canvas).css("height", "100%");

                $this.append(view.canvas);
                $(view.status).addClass("status");
                $this.append(view.status);
                methods.setmode.call($this, {mode: "pan"});

                //add master layer
                view.addlayer("master", options.src, true);

                //setup magnifier canvas
                view.magnifier_canvas.width = options.magnifier_view_area;
                view.magnifier_canvas.height = options.magnifier_view_area;
/*

                //load thumbnail
                layer.thumb = new Image();
                layer.thumb.src = options.src+"/thumb.png";
*/
/*
                // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
                // requestAnim shim layer by Paul Irish
                window.requestAnimFrame = (function(){
                  return  window.requestAnimationFrame       || 
                          window.webkitRequestAnimationFrame || 
                          window.mozRequestAnimationFrame    || 
                          window.oRequestAnimationFrame      || 
                          window.msRequestAnimationFrame     || 
                          function(callback, element){
                            window.setTimeout(callback, 1000 / 60);
                          };
                })();

                var draw_thread = function() {
                    requestAnimFrame(draw_thread);
                    if(view.pan.xdest) {
                        view.pan();
                    }

                    if(view.needdraw) {
                        view.draw();
                    }
                };
                draw_thread();
*/

                //redraw thread
                var draw_thread = function() {
                    if(view.pan.xdest) {
                        view.pan();
                    }

                    if(view.needdraw) {
                        view.draw();
                    }
                    //setTimeout(draw_thread, 30);
                }
                //read http://ejohn.org/blog/how-javascript-timers-work/
                setInterval(draw_thread, 20);

                ///////////////////////////////////////////////////////////////////////////////////
                //event handlers
                $(view.canvas).mousedown(function(e) {
                    var offset = $(view.canvas).offset();
                    var x = e.pageX - offset.left;
                    var y = e.pageY - offset.top;

                    view.mousedown = true;

                    var layer = view.layers[0];

                    //mode specific extra info
                    switch(view.mode) {
                    case "pan":
                        view.pan.xdest = null;//cancel pan
                        view.pan.xhot = x - layer.xpos;
                        view.pan.yhot = y - layer.ypos;
                        document.body.style.cursor="move";
                        break;
                    case "select_1d":
                        view.select.item = view.hittest_select_1d(x,y);
                        break;
                    case "select_2d":
                        view.select.item = view.hittest_select_2d(x,y);
                    }
                    switch(view.mode) {
                    case "select_1d":
                    case "select_2d":
                        view.select.xhot = x - view.select.x;
                        view.select.yhot = y - view.select.y;
                        view.select.whot = x - view.select.width;
                        view.select.hhot = y - view.select.height;
                        view.select.xprev = view.select.x;
                        view.select.yprev = view.select.y;
                        view.select.wprev = view.select.width;
                        view.select.hprev = view.select.height;
                        break;
                    }
                    return false;
                });

                //we want to capture mouseup on whole doucument - not just canvas
                $(document).mouseup(function(){
                    document.body.style.cursor="auto";
                    view.mousedown = false;
                    return false;
                });

                $(view.canvas).mousemove(function(e) {
                    var offset = $(view.canvas).offset();
                    var x = e.pageX - offset.left;
                    var y = e.pageY - offset.top;
                    view.xnow = x;
                    view.ynow = y;

                    if(options.magnifier) {
                        //need to redraw magnifier
                        view.needdraw = true;
                    }

                    if(view.mousedown) {
                        //dragging
                        switch(view.mode) {
                        case "pan":
                            for(var i=0; i<view.layers.length; i++) {
                                var layer = view.layers[i];
                                layer.xpos = x - view.pan.xhot;
                                layer.ypos = y - view.pan.yhot;
                            }
                            view.draw();//TODO - should I call needdraw instead?
                            break;
                        case "select_1d":
                            switch(view.select.item) {
                            case "topleft":
                                view.select.x = x - view.select.xhot;
                                view.select.y = y - view.select.yhot;
                                view.select.width = view.select.wprev + (view.select.xprev - view.select.x);
                                view.select.height = view.select.hprev + (view.select.yprev - view.select.y);
                                break;
                            case "bottomright":
                                view.select.width = x - view.select.whot;
                                view.select.height = y - view.select.hhot;
                                break;
                            }
                            view.draw();
                            break;
                        case "select_2d":
                            switch(view.select.item) {
                            case "inside":
                                view.select.x = x - view.select.xhot;
                                view.select.y = y - view.select.yhot;
                                break;
                            case "topleft":
                                view.select.x = x - view.select.xhot;
                                view.select.y = y - view.select.yhot;
                                view.select.width = view.select.wprev + (view.select.xprev - view.select.x);
                                view.select.height = view.select.hprev + (view.select.yprev - view.select.y);
                                break;
                            case "topright":
                                view.select.y = y - view.select.yhot;
                                view.select.width = x - view.select.whot;
                                view.select.height = view.select.hprev + (view.select.yprev - view.select.y);
                                break;
                            case "bottomleft":
                                view.select.x = x - view.select.xhot;
                                view.select.height = y - view.select.hhot;
                                view.select.width = view.select.wprev + (view.select.xprev - view.select.x);
                                break;
                            case "bottomright":
                                view.select.width = x - view.select.whot;
                                view.select.height = y - view.select.hhot;
                                break;
                            }
                            view.draw();
                            break;
                        }
                    } else {
                        //just hovering
                        switch(view.mode) {
                        case "pan":
                            break;
                        case "select_1d":
                            view.select.item = view.hittest_select_1d(x,y);
                            break;
                        case "select_2d":
                            view.select.item = view.hittest_select_2d(x,y);
                            break;
                        }

                        switch(view.mode) {
                        case "select_1d":
                        case "select_2d":
                            switch(view.select.item) {
                            case "inside": 
                                document.body.style.cursor="move"; break;
                            case "topleft": 
                            case "bottomright": 
                                document.body.style.cursor="nw-resize"; break;
                            case "topright": 
                            case "bottomleft": 
                                document.body.style.cursor="ne-resize"; break;
                            default: document.body.style.cursor="auto";
                            }
                            break;
                        }
                    }

                    view.update_status(); //mouse position change doesn't cause view udpate.. so I have to call this 

                    return false;
                });

                $(view.canvas).bind("mousewheel.tileviewer", function(e, delta) {
                    view.pan.xdest = null;//cancel pan
                    delta = delta*options.zoom_sensitivity;
                    var offset = $(view.canvas).offset();
                    view.change_zoom(delta, e.pageX - offset.left, e.pageY - offset.top);
                    view.needdraw = true;
                    return false;
                });
            } else {
                console.log("already initiazlied");
            }

        }); //for each
    }, //public / init

/*
    ///////////////////////////////////////////////////////////////////////////////////
    // 
    zoom: function (options) {
        return this.each(function() {
            var view = $(this).data("view");
            view.change_zoom(options.delta,0,0,0,0);
        });
    },
*/

    ///////////////////////////////////////////////////////////////////////////////////
    // call this if everytime you resize the container (TODO - can't it be automated?)
    addlayer: function (options) {
        return this.each(function() {
            var view = $(this).data("view");
            view.addlayer(options.id, options.src, options.enable);
        });
    },

    // set layer options
    layer: function(options) {
        return this.each(function() {
            var view = $(this).data("view");
            //search for layer
            for(var i=0; i<view.layers.length; i++) {
                var layer = view.layers[i];
                if(layer.id == options.id) {
                    view.layers[i] = $.extend(layer, options);
                    view.needdraw = true;
                    break;
                }
            }
        });
    },

    ///////////////////////////////////////////////////////////////////////////////////
    // call this if everytime you resize the container (TODO - can't it be automated?)
    resize: function (options) {
        return this.each(function() {
            var view = $(this).data("view");
            view.canvas.width = options.width;
            view.canvas.height = options.height;
            view.needdraw = true;
        });
    },

    ///////////////////////////////////////////////////////////////////////////////////
    // Override current options
    options: function(options) {
        return this.each(function() {
            var current_options = $(this).data("options");
            $.extend(current_options, options);
            var view = $(this).data("view");
            view.needdraw = true;
        });
    },

    ///////////////////////////////////////////////////////////////////////////////////
    // use this to animate the view (or zoom)
    pan: function (options) {
        return this.each(function() {
            var view = $(this).data("view");
            view.pan.xdest = options.x;
            view.pan.ydest = options.y;
            view.pan.leveldest = options.level;
        });
    },

/*
    ///////////////////////////////////////////////////////////////////////////////////
    // use this to jump to the destination pos / zoom
    setpos: function (options) {
        return this.each(function() {
            var layer = $(this).data("layer");
            var view = $(this).data("view");
            layer.xpos = options.x;
            layer.ypos = options.y;
            layer.level = Math.round(options.level); //TODO process sub decimal value
        });
    },
*/

    ///////////////////////////////////////////////////////////////////////////////////
    // use this to animate the view (or zoom)
    getpos: function () {
        //get current position
        var view = $(this).data("view");
        var layer = view.layers[0];
        var pos = view.center_pixelpos(layer);
        pos.level = Math.round((layer.level + layer.info.tilesize/layer.tilesize-1)*1000)/1000;
        return pos;
    },

    ///////////////////////////////////////////////////////////////////////////////////
    // set current mouse mode
    setmode: function(options) {
        return this.each(function() {
            var view = $(this).data("view");

            switch(options.mode) {
            case "pan":
                break;
            case "select_1d":
            case "select_2d":
                view.select.x = 50;
                view.select.y = 50;
                view.select.width = view.canvas.clientWidth-100;
                view.select.height = view.canvas.clientHeight-100;
                break;
            default:
                console.log("unknown mode:" + options.mode);
                return;
            }

            view.mode = options.mode;
            view.needdraw = true;
        });
    }

};//end of public methods

//bootstrap
$.fn.tileviewer = function( method ) {
    if ( methods[method] ) {
        return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
    } else if ( typeof method === 'object' || ! method ) {
        return methods.init.apply( this, arguments );
    } else {
        console.log( 'Method:' +  method + ' does not exist on jQuery.tileviewer' );
    }
};

})(jQuery);
