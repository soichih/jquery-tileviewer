/* 

TileViewer HTML5 client

    Version: 2.0.0

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
            magnifier_view_size: 128, //view size
            magnifier_view_area: 32, //pixel w/h sizes to zoom
            graber_size: 12, //size of the grabber area
            maximum_pixelsize: 1,//set this to >1 if you want to let user to zoom image after reaching its original resolution (also consider using magnifier..)
            thumb_depth: 2 //level depth when thumb nail should appear
        };

        return this.each(function() {
            var $this = $(this);
            options = $.extend(defaults, options);//override defaults with options
            $this.data("options", options);

            ///////////////////////////////////////////////////////////////////////////////////
            // Now we can start initializing
            //If the plugin hasn't been initialized yet..
            var view = $this.data("view");
            var layer = $this.data("layer");
            if(!view) {
                var view = {
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
                    framerate: null,//current framerate (1000 msec / drawtime msec)
                    loading: 0, //number of images that are currently loading...
                    needdraw: false, //flag used to request for frameredraw 

                    ///////////////////////////////////////////////////////////////////////////////////
                    // internal functions
                    draw: function() {
                        view.needdraw = false;
                        if(layer.info == null) { return; }

                        var start = new Date().getTime();

                        var ctx = view.canvas.getContext("2d");
                        view.canvas.width = $this.width();//clear
                        //view.canvas.width = view.canvas.width;//clear

                        view.draw_tiles(ctx);

                        if(options.magnifier) {
                            view.draw_magnifier(ctx);
                        }

                        switch(view.mode) {
                        case "pan":
                            if(options.thumbnail) {
                                //only draw thumbnail if we are zoomed in far enough
                                if(layer.info._maxlevel - layer.level > options.thumb_depth) {
                                    view.draw_thumb(ctx);
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

                        //calculate framerate
                        var end = new Date().getTime();
                        var time = end - start;
                        view.framerate = Math.round(1000/time);

                        view.update_status();
                    },

                    //TODO - let user override this
                    update_status: function() {
                        var pixel_pos = view.client2pixel(view.xnow, view.ynow);
                        $(view.status).html(
                            "width: " + layer.info.width + 
                            "<br>height: " + layer.info.height + 
                            "<br>level:" + Math.round((layer.level + layer.info.tilesize/layer.tilesize-1)*100)/100 +
                            "<br>framerate: " + view.framerate + 
                            "<br>images loading:" + view.loading + 
                            "<br>x:" + pixel_pos.x + 
                            "<br>y:" + pixel_pos.y  
                        );
                    },

                    draw_tiles: function(ctx) {
                        //display tiles
                        var xmin = Math.max(0, Math.floor(-layer.xpos/layer.tilesize));
                        var ymin = Math.max(0, Math.floor(-layer.ypos/layer.tilesize));
                        var xmax = Math.min(layer.xtilenum, Math.ceil((view.canvas.clientWidth-layer.xpos)/layer.tilesize));
                        var ymax = Math.min(layer.ytilenum, Math.ceil((view.canvas.clientHeight-layer.ypos)/layer.tilesize));
                        for(var y = ymin; y < ymax; y++) {
                            for(var x  = xmin; x < xmax; x++) {
                                view.draw_tile(ctx,x,y);
                            }
                        }
                    },

                    draw_thumb: function(ctx) {
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
                        var rect = view.get_viewpos();
                        var factor = layer.thumb.height/layer.info.height;
                        ctx.strokeStyle = '#f00'; 
                        ctx.lineWidth   = 1;
                        ctx.strokeRect(rect.x*factor, rect.y*factor, rect.width*factor, rect.height*factor);
                    },

                    draw_tile: function(ctx,x,y) {
                        var tileid = x + y*layer.xtilenum;
                        var url = options.src+"/level"+layer.level+"/"+tileid+".png";
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
                                //firefox can't draw sub-pixel image .. adjust it..
                                ctx.drawImage(img, Math.floor(layer.xpos+x*layer.tilesize), Math.floor(layer.ypos+y*layer.tilesize),    
                                    Math.ceil(xsize),Math.ceil(ysize));
                            } else {
                                ctx.drawImage(img, layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize,ysize);
                            }
                        }

                        if(img == null) {
                            //new url.. request..
                            var img = new Image();
                            img.loaded = false;
                            img.onload = function() {
                                this.loaded = true;
                                if(this.level_loaded_for == layer.level) {
                                    view.needdraw = true;
                                }
                                view.loading--;
                            };
                            img.onerror = function() {
                                //console.log("failed to load " + url + " on x= " + x + " y=" + y);
                            }
                            img.level_loaded_for = layer.level;
                            img.src = url;
                            layer.tiles[url] = img;
                            view.loading++;
                        } else if(img.loaded) {
                            dodraw(); //good.. we have the image.. dodraw
                            return;
                        }

                        //draw subtile instead
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
                            var url = options.src+"/level"+(layer.level+down)+"/"+subtileid+".png";
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
                                return;
                            }
                            //try another level
                            down++;
                        }
                        
                        //nosubtile available.. draw empty rectangle as the last resort
                        ctx.fillStyle = options.empty;
                        ctx.fillRect(layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize, ysize);
                    },

                    draw_magnifier:  function(ctx) {
                        //grab magnifier image
                        var mcontext = view.magnifier_canvas.getContext("2d");
                        var marea = ctx.getImageData(view.xnow-options.magnifier_view_area/2, view.ynow-options.magnifier_view_area/2, options.magnifier_view_area,options.magnifier_view_area);
                        mcontext.putImageData(marea, 0,0);//draw to canvas so that I can zoom it up

                        //display on the bottom left corner
                        ctx.drawImage(view.magnifier_canvas, 0, view.canvas.clientHeight-options.magnifier_view_size, options.magnifier_view_size, options.magnifier_view_size);

                        //display where mouse is
                        //ctx.drawImage(view.magnifier_canvas, view.xnow-options.magnifier_view_size/2, view.ynow-options.magnifier_view_size/2, options.magnifier_view_size, options.magnifier_view_size);
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
                        //draw box
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.shadowBlur    = 0;
                        ctx.shadowColor   = 'rgba(0,0,0,0)';
                        ctx.strokeStyle = '#0c0'; 
                        ctx.lineWidth   = 2;
                        ctx.strokeRect(view.select.x, view.select.y, view.select.width, view.select.height);

                        //draw grabbers
                        ctx.beginPath();
                        ctx.arc(view.select.x, view.select.y, options.graber_size/2, 0, Math.PI*2, false);//topleft
                        ctx.arc(view.select.x+view.select.width, view.select.y, options.graber_size/2, 0, Math.PI*2, false);//topright
                        ctx.arc(view.select.x, view.select.y+view.select.height, options.graber_size/2, 0, Math.PI*2, false);//bottomleft
                        ctx.arc(view.select.x+view.select.width, view.select.y+view.select.height, options.graber_size/2, 0, Math.PI*2, false);//bottomright
                        ctx.fillStyle = '#0c0';
                        ctx.fill();
                    },

                    recalc_viewparams: function() {
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
                    get_viewpos: function() {
                        var factor = Math.pow(2, layer.level)*layer.info.tilesize/layer.tilesize;
                        return {
                            x: -layer.xpos*factor,
                            y: -layer.ypos*factor,
                            width: view.canvas.clientWidth*factor,
                            height: view.canvas.clientHeight*factor
                        };
                    },

                    //calculate pixel position based on client x/y
                    client2pixel: function(client_x, client_y) {
                        var factor = Math.pow(2,layer.level) * layer.info.tilesize / layer.tilesize;
                        var pixel_x = Math.round((client_x - layer.xpos)*factor);
                        var pixel_y = Math.round((client_y - layer.ypos)*factor);
                        return {x: pixel_x, y: pixel_y};
                    },

                    //calculate pixel potision on the center
                    center_pixelpos: function() {
                        return view.client2pixel(view.canvas.clientWidth/2, view.canvas.clientHeight/2);
                    },

                    change_zoom: function(delta, x, y) {

                        //ignore if we've reached min/max zoom
                        if(layer.level == 0 && layer.tilesize+delta > layer.info.tilesize*options.maximum_pixelsize) return false;
                        if(layer.level == layer.info._maxlevel && layer.tilesize+delta < layer.info.tilesize/2) return false;

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
                                view.recalc_viewparams();
                            }
                        }
                        if(layer.tilesize < layer.info.tilesize/2) { //level up
                            if(layer.level != layer.info._maxlevel) {
                                layer.level++;
                                layer.tilesize *= 2; //we can't use bitoperation here.. need to preserve floating point
                                view.recalc_viewparams();
                            }
                        }

                        view.needdraw = true;
                    },

                    pan: function() {
                        var factor = Math.pow(2,layer.level)*layer.info.tilesize/layer.tilesize;
                        var xdest_client = view.pan.xdest/factor + layer.xpos;
                        var ydest_client = view.pan.ydest/factor + layer.ypos;
                        var center = view.center_pixelpos();
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
                                var dzoom = 2;
                                if(current_level < view.pan.leveldest) dzoom = -dzoom;
                                view.change_zoom(dzoom, xdest_client*2 - view.canvas.clientWidth/2, ydest_client*2 - view.canvas.clientHeight/2);
                            }

                            if(dist < factor && level_dist < 0.1) {
                                //reached destination
                                console.log("reached");
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
                    }
                };//view definition
                $this.data("view", view);

                var layer = {
                    //json.info will be loaded here (static information about the image)
                    info:  null, 

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
                    tiles: [] //tiles loaded (old ones will be shifted out by loader)
                }
                $this.data("layer", layer);

                //setup views
                $this.addClass("tileviewer");
                $(view.canvas).css("background-color", "#222");
/*
                $(view.canvas).css("width", options.width);
                $(view.canvas).css("height", options.height);
                view.canvas.width = options.width;
                view.canvas.height = options.height;
*/
                $(view.canvas).css("width", "100%");
                $(view.canvas).css("height", "100%");

                $this.append(view.canvas);
                $(view.status).addClass("status");
                $this.append(view.status);
                methods.setmode.call($this, {mode: "pan"});
                //load info.json
                $.ajax({
                    url: options.src+"/info.json",
                    dataType: "json",
                    success: function(data) {
                        layer.info = data;

                        //calculate metadata
                        var v1 = Math.max(layer.info.width, layer.info.height)/layer.info.tilesize;
                        layer.info._maxlevel = Math.ceil(Math.log(v1)/Math.log(2));

                        //set initial level/size
                        layer.level = Math.max(0, layer.info._maxlevel-1);
                        layer.tilesize = layer.info.tilesize/2;

                        view.recalc_viewparams();
                        view.needdraw = true;
                    }
                });

                //setup magnifier canvas
                view.magnifier_canvas.width = options.magnifier_view_area;
                view.magnifier_canvas.height = options.magnifier_view_area;
/*
                //load image
                view.icons.box = new Image();
                view.icons.box.src = "images/box.png";
*/
                //load thumbnail
                layer.thumb = new Image();
                layer.thumb.src = options.src+"/thumb.png";

                // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
                // requestAnim shim layer by Paul Irish
                window.requestAnimFrame = (function(){
                  return  window.requestAnimationFrame       || 
                          window.webkitRequestAnimationFrame || 
                          window.mozRequestAnimationFrame    || 
                          window.oRequestAnimationFrame      || 
                          window.msRequestAnimationFrame     || 
                          function(/* function */ callback, /* DOMElement */ element){
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

/*
                //redraw thread
                var draw_thread = function() {
                    if(view.pan.xdest) {
                        pan();
                    }

                    if(view.needdraw) {
                        draw();
                    }
                    //setTimeout(draw_thread, 30);
                }
                //read http://ejohn.org/blog/how-javascript-timers-work/
                setInterval(draw_thread, 30);
*/

                ///////////////////////////////////////////////////////////////////////////////////
                //set upevent handlers
                $(view.canvas).mousedown(function(e) {
                    var offset = $(view.canvas).offset();
                    var x = e.pageX - offset.left;
                    var y = e.pageY - offset.top;

                    view.mousedown = true;

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

                    if(layer.info == null) { return false; }

                    if(options.magnifier) {
                        //need to redraw magnifier
                        view.needdraw = true;
                    }

                    if(view.mousedown) {
                        //dragging
                        switch(view.mode) {
                        case "pan":
                            layer.xpos = x - view.pan.xhot;
                            layer.ypos = y - view.pan.yhot;
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
                    //if(view.mode == "pan") {
                        delta = delta*options.zoom_sensitivity;
                        var offset = $(view.canvas).offset();
                        view.change_zoom(delta, e.pageX - offset.left, e.pageY - offset.top);
                    //}
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
    setpos: function (options) {
        console.log("requested level " + options.level);
        return this.each(function() {
            var view = $(this).data("view");
            view.pan.xdest = options.x;
            view.pan.ydest = options.y;
            view.pan.leveldest = options.level;
        });
    },

    ///////////////////////////////////////////////////////////////////////////////////
    // use this to animate the view (or zoom)
    getpos: function () {
        //get current position
        var view = $(this).data("view");
        var layer = $(this).data("layer");
        var pos = view.center_pixelpos();
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
