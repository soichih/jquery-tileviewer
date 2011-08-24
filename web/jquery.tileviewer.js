/*! Copyright (c) 2011 Soichi Hayashi (https://sites.google.com/site/soichih/)
 * Licensed under the MIT License
 * 
 * TileViewer HTML5 client
 * Version: 2.0.0
 *
 * This plugin is tested with following dependencies
 * JQuery 1.3.2
 * Brandon Aaron's (http://brandonaaron.net) mousewheel jquery plugin 3.0.3
 *
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
            thumb_depth: 2 //level depth when thumb nail should appear
        };

        return this.each(function() {
            var $this = $(this);
            console.dir(options);
            options = $.extend(defaults, options);//override defaults with options
            $this.data("options", options);

            ///////////////////////////////////////////////////////////////////////////////////
            // Define internal functions
            var draw = function() {

                view.needdraw = false;

                var ctx = view.canvas.getContext("2d");
                view.canvas.width = view.canvas.width;//clear
                var start = new Date().getTime();
                if(layer.info == null) {
                    $(view.status).html("Loading info.json ..."); 
                    return;
                }

                draw_tiles(ctx);

                //draw thumbnail if we are zoomed in far enough
                if(layer.info._maxlevel - layer.level > options.thumb_depth) {
                    draw_thumb(ctx);
                }

                //display status
                var end = new Date().getTime();
                var time = end - start;
                $(view.status).html("width: " + layer.info.width + " height: " + layer.info.height + " time(msec):" + time);
                //$(status).html("xmin: " + xmin + " xmax: " + xmax + " xtilenum:" + layer.xtilenum + " level: " + layer.level);
            }

            var draw_tiles = function(ctx) {
                //display tiles
                var xmin = Math.max(0, Math.floor(-layer.xpos/layer.tilesize));
                var ymin = Math.max(0, Math.floor(-layer.ypos/layer.tilesize));
                var xmax = Math.min(layer.xtilenum, Math.ceil((view.canvas.clientWidth-layer.xpos)/layer.tilesize));
                var ymax = Math.min(layer.ytilenum, Math.ceil((view.canvas.clientHeight-layer.ypos)/layer.tilesize));
                for(var y = ymin; y < ymax; y++) {
                    for(var x  = xmin; x < xmax; x++) {
                        drawtile(ctx,x,y);
                    }
                }
            }

            var draw_thumb = function(ctx) {
                ctx.drawImage(layer.thumb, 0, 0, layer.thumb.width, layer.thumb.height);

                var rect = get_viewpos();
                var factor = layer.thumb.height/layer.info.height;
                ctx.strokeStyle = '#f00'; 
                ctx.lineWidth   = 2;
                ctx.strokeRect(rect.x*factor, rect.y*factor, rect.width*factor, rect.height*factor);
            }

            var drawtile = function(ctx,x,y) {
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
                    ctx.drawImage(img, layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize,ysize);
                }

                if(img == null) {
                    //new url.. request
                    var img = new Image();
                    img.onload = function() {
                        img.loaded = true;
                        if(img.level_loaded_for == layer.level) {
                            view.needdraw = true;
                        }
                    };
                    img.onerror = function() {
                        //console.log("failed to load " + url + " on x= " + x + " y=" + y);
                    }
                    img.loaded = false;
                    img.level_loaded_for = layer.level;
                    img.src = url;
                    layer.tiles[url] = img;
                } else if(img.loaded) {
                    dodraw();
                    return;
                }
                drawsubtile(ctx,x,y);
            }
            
            var drawsubtile = function(ctx,x,y) {

                var xsize = layer.tilesize;
                var ysize = layer.tilesize;
                if(x == layer.xtilenum-1) {
                    xsize = (layer.tilesize/layer.info.tilesize)*layer.tilesize_xlast;
                }
                if(y == layer.ytilenum-1) {
                    ysize = (layer.tilesize/layer.info.tilesize)*layer.tilesize_ylast;
                }

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
                        ctx.drawImage(img, sx, sy, sw, sh, 
                            layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize,ysize);
                        return;
                    }
                    //try another level
                    down++;
                }
                
                //nosubtile available.. draw empty rectangle
                ctx.fillStyle = options.empty;
                ctx.fillRect(layer.xpos+x*layer.tilesize, layer.ypos+y*layer.tilesize, xsize, ysize);
            }

            var recalc_viewparams = function() {
                var factor = Math.pow(2,layer.level);

                //calculate number of tiles on current level
                layer.xtilenum = Math.ceil(layer.info.width/factor/layer.info.tilesize);
                layer.ytilenum = Math.ceil(layer.info.height/factor/layer.info.tilesize);

                //calculate size of the last tile
                layer.tilesize_xlast = layer.info.width/factor%layer.info.tilesize;
                layer.tilesize_ylast = layer.info.height/factor%layer.info.tilesize;
                if(layer.tilesize_xlast == 0) layer.tilesize_xlast = layer.info.tilesize;
                if(layer.tilesize_ylast == 0) layer.tilesize_ylast = layer.info.tilesize;
            }

            //get current pixel coordinates representing the view
            var get_viewpos = function() {
                var factor = Math.pow(2, layer.level)*layer.info.tilesize/layer.tilesize;
                return {
                    x: -layer.xpos*factor,
                    y: -layer.ypos*factor,
                    width: view.canvas.clientWidth*factor,
                    height: view.canvas.clientHeight*factor
                }; 
            }

            //set current mouse mode
            var setmode = function(mode) {
                $(view.canvas).removeClass("mode_pan");
                $(view.canvas).removeClass("mode_sel2d");
                $(view.canvas).removeClass("mode_sel1d");
                $(view.canvas).addClass("mode_"+mode);
                view.mode = mode;
            }

            ///////////////////////////////////////////////////////////////////////////////////
            // Now we can start initializing
            //If the plugin hasn't been initialized yet..
            var view = $this.data("view");
            var layer = $this.data("layer");
            if(!view) {
                var view = {
                    //view elements
                    canvas: document.createElement("canvas"),
                    status: document.createElement("span"),

                    //current mouse left button mode (pan, sel2d, sel1d, etc..)
                    mode: null, 

                    //mouse position where user first mousedowned
                    xdown: null, 
                    ydown: null,

                    needdraw: false //flag used to request for frameredraw 
                };
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
                $(view.canvas).css("width", options.width);
                $(view.canvas).css("height", options.height);
                view.canvas.width = options.width;
                view.canvas.height = options.height;
                $this.append(view.canvas);
                $(view.status).addClass("status");
                $this.append(view.status);
                setmode("pan");
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

                        recalc_viewparams();
                        draw();
                    } 
                }); 

                //load thumbnail
                layer.thumb = new Image();
                layer.thumb.src = options.src+"/thumb.png";

                //redraw thread
                var check_needdraw = function() {
                    if(view.needdraw) {
                        draw();
                    }
                    setTimeout(check_needdraw, 100);
                }
                setTimeout(check_needdraw, 100);

                ///////////////////////////////////////////////////////////////////////////////////
                //set upevent handlers
                $(view.canvas).mousedown(function(e) {
                    view.xdown = e.clientX - layer.xpos;
                    view.ydown = e.clientY - layer.ypos;
                    return false;
                });

                //we want to capture mouseup on whole doucument - not just canvas
                $(document).mouseup(function(){
                    view.xdown = null;
                    view.ydown = null;
                    return false;
                });

                $(view.canvas).mousemove(function(e) {
                    if(view.xdown) {
                        if(view.mode == "pan") {
                            layer.xpos = e.clientX - view.xdown;
                            layer.ypos = e.clientY - view.ydown;
                            draw();
                        }
                    }
                    return false;
                });

                $(view.canvas).bind("mousewheel.tileviewer", function(e, delta) {
                    if(view.mode == "pan") {
                        delta = delta*16;

                        //ignore if we've reached min/max zoom
                        if(layer.level == 0 && layer.tilesize+delta > layer.info.tilesize) return false;
                        if(layer.level == layer.info._maxlevel && layer.tilesize+delta < layer.info.tilesize/2) return false;

                        //*before* changing tilesize, adjust offset so that we will zoom into where the cursor is
                        var offset = $(view.canvas).offset();
                        var dist_from_x0 = e.pageX - offset.left - layer.xpos;
                        var dist_from_y0 = e.pageY - offset.top - layer.ypos;
                        layer.xpos -= dist_from_x0/layer.tilesize*delta;
                        layer.ypos -= dist_from_y0/layer.tilesize*delta;

                        layer.tilesize += delta;

                        //adjust level
                        if(layer.tilesize > layer.info.tilesize) { //level down
                            if(layer.level != 0) {
                                layer.level--;
                                layer.tilesize /= 2; //we can't use bitoperation here.. need to preserve floating point
                                recalc_viewparams();
                            }
                        }
                        if(layer.tilesize < layer.info.tilesize/2) { //level up
                            if(layer.level != layer.info._maxlevel) {
                                layer.level++;
                                layer.tilesize *= 2; //we can't use bitoperation here.. need to preserve floating point
                                recalc_viewparams();
                            }
                        }

                        draw();
                    }
                    return false;
                });
            }

        });
    },

    ///////////////////////////////////////////////////////////////////////////////////
    //
    // set current mouse mode
    //
    setmode: function(mode) {
        return this.each(function() {
            this.setmode(mode);
        });
    }

};//end of methods

//bootstrap
$.fn.tileviewer = function( method ) {
    if ( methods[method] ) {
        return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
    } else if ( typeof method === 'object' || ! method ) {
        return methods.init.apply( this, arguments );
    } else {
        $.error( 'Method ' +  method + ' does not exist on jQuery.tileviewer' );
    }
};

})(jQuery);
