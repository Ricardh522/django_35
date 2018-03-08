define([
    "esri/request",
    "esri/toolbars/draw",
    "esri/graphic",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol",
    "esri/tasks/query",
    "esri/SpatialReference",
    "esri/geometry/Polygon",
    "esri/dijit/PopupTemplate",
    "esri/layers/FeatureLayer",
    "esri/Color",
    "esri/tasks/FeatureSet",

    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/_base/lang",

    "dojo/dom-construct",
    "dojo/dom",
    "dojo/on",
    "dojo/json",
    "dojo/topic",
    "dojo/request/xhr",
    "dojo/request/script",
    "dojo/request",
    "dojo/promise/all",
    "dojo/Deferred",
    "dojo/cookie",
    "dojo/parser",
    
    "dijit/registry",
    "dijit/ConfirmDialog",
    "dijit/form/Button",
    "dijit/form/CheckBox",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dijit/_WidgetsInTemplateMixin",
    "dojo/text!./templates/drawToolbar.html",
    "dojo/NodeList-traverse"
], function (
    esriRequest,
    Draw,
    Graphic,
    SimpleMarkerSymbol,
    SimpleLineSymbol,
    SimpleFillSymbol,
    Query,
    SpatialReference,
    Polygon,
    PopupTemplate,
    FeatureLayer,
    Color,
    FeatureSet,

    declare,
    Array,
    lang,

    domConstruct,
    dom,
    on,
    JSON,
    topic,
    xhr,
    script,
    request,
    all,
    Deferred,
    cookie,
    parser,
  
    registry,
    ConfirmDialog,
    Button,
    CheckBox,
    _WidgetBase,
    _TemplatedMixin,
    _WidgetsInTemplateMixin,
    template
) {
    return declare([_WidgetBase, _TemplatedMixin, _WidgetsInTemplateMixin], {
        map: null,
        baseClass: "_draw-bar",
        templateString: template,
        optOut: false,
        constructor: function(config) {
            console.log("widgets._eDock.drawToolbar::constructor", arguments);
            declare.safeMixin(this, config);
            this.inherited(arguments);
        },

        postCreate: function() {
            console.log("widgets._eDock.drawToolbar::postCreate", arguments);
            var self = this;
            parser.parse();
            var grid_layer;

            var cellDialog = self.cellDialog = new ConfirmDialog({
              title: "Grid Selection Next Steps",
              autofocus: false
            });
            var content = domConstruct.create("div", {"id": "_dialogBox"});
            var text = `<b>SEARCH</b> - If you are interested in locating files </br>\
                that have been assigned to these cells,</br>\
                click the blue Search button.</br>\
                </br>\
                <ul>
                    <li>
                    The selected grid cells have been added</br>\
                    to the "Grid Cells:" text input.
                    </li>
                </ul>
           
                or</br>\
                </br>\
                <b>UPDATE</b> - To create an assignment</br>\
                between the grid cells and a file,</br>\
                click the Update button at the</br>\
                bottom of the far left pane.</br>\
                 </br>\
                <ul>
                    <li>
                    This will close the map</br>\
                    and open the file browser</br>\
                    along with the Attribute panel.</br>\
                    </li>
                    <li>
                    The grid cells</br>\
                    have been added into the</br>\
                    "New Grid Cells" area.</br>\
                    of the Attribute Panel</br>\
                    </li>
                    <li>
                    If a file name is not shown in the Attribute panel,</br>\
                    then a file is not selected.</br>\
                    Click on the desired file in the file browser</br>\
                    window to select it.</br>\
                    </li>
                    <li>
                    If editing is available</br>\
                    clicking Save in the Attribute panel</br>\
                    will assign the grid cells to the selected file.</br>\
                    </li>
                  </ul>
                <input id='dialogOptOut' name='dialogOptOut' data-dojo-type='dijit/form/CheckBox' value='optOut'/>\
                <label for='dialogOptOut'>Do not show this dialog again</label>
                `;
            domConstruct.place(text, content);
            self.cellDialog.set("content", content);
            // self.cellDialog.containerNode.scrollTop;



             // obtain the grid layer from the map
            var layers = self.map.graphicsLayerIds;
            var lyrs = Array.filter(layers, function(id) {
                var lyr = self.map.getLayer(id);
                try {
                    var result = lyr.name.indexOf("Grid") > -1;
                    return result;
                } catch (e) {
                    return false;
                }
            });

            if (lyrs.length > 1) {
                console.log("More than one grid layer exists in the map");
            } else if (lyrs.length === 0) {
                console.log("There were no grid layers found in the map");
            } else {
                grid_layer = self.grid_layer = lyrs[0];
            }

            var draw_bar = self.draw_bar = new Draw(self.map, {
                showTooltips: true,
                drawTime: 25,
                tolerance: 4
            });
            draw_bar.on("draw-complete", addToMap);

            // Add the control buttons to the template
            Array.forEach(["Point", "Multi Point", "Polygon", "Freehand Polygon", "Ellipse", "Circle"], function(e) {
                var btn = new Button({
                    label: e,
                    // TODO-bind this function to the widget scope
                    onClick: function() {
                        self.map.graphics.clear();
                        var grid = self.map.getLayer(grid_layer);
                        grid.clearSelection();
                        grid.setDefinitionExpression("");
                        grid.refresh();

                        var tool = this.label.toUpperCase().replace(/ /g, "_");
                        self.map.hideZoomSlider();
                        self.map.setInfoWindowOnClick(false);
                        draw_bar.activate(Draw[tool]);
                    }
                }, self[e]);
            });
            // Add a clear all button to the template
            var clear_btn = new Button({
                label: "Clear All",
                onClick: function(evt) {
                    self.map.graphics.clear();
                    var lyr = self.grid_layer;
                    var layer = self.map.getLayer(lyr);

                    if (layer.getDefinitionExpression()) {
                        layer.clearSelection();
                        layer.setDefinitionExpression("");
                        layer.refresh();
                    }

                    topic.publish("grids/clear");

                }
            }, self.ClearAll);

            function addToMap(evt) {
                var symbol;
                draw_bar.deactivate();
                self.map.showZoomSlider();
                self.map.setInfoWindowOnClick(true);
                self.map.graphics.clear();
                switch (evt.geometry.type) {
                    case "point":
                        symbol = new SimpleMarkerSymbol();
                        break;
                    case "multipoint":
                        symbol = new SimpleMarkerSymbol();
                        break;
                    case "polyline":
                        symbol = new SimpleLineSymbol();
                        break;
                    default:
                        symbol = new SimpleFillSymbol();
                        break;
                  }
                var graphic = new Graphic(evt.geometry, symbol);
                self.map.graphics.add(graphic);
                // the query grid function will populate the Search and Edit windows with the selected Grid Cell values
                self.query_grid(graphic);
                // if the user has not opted out, show the dialog
                if (!self.optOut) {
                  self.cellDialog.show();
                }
            }

            self.setupConnections();
        },

        setupConnections: function() {
          var self = this;
          var okButton = self.cellDialog.okButton;
          var optOut = registry.byId('dialogOptOut');
          on(okButton, 'click', function(evt) {
            if (optOut.checked) {
              self.optOut = true;
            } else {
              self.optOut = false;
            }
          });
        },

        query_grid: function(graphic) {
            var self = this;
            var lyr = self.grid_layer;
            var layer = self.map.getLayer(lyr);

            // if (layer.getDefinitionExpression()) {
            //     layer.clearSelection();
            //     layer.setDefinitionExpression("");
            //     layer.refresh();
            // }
            
            var query = new Query();
            query.geometry = graphic.geometry;
            layer.queryFeatures(query, function(featureSet) {
                console.log(featureSet);
                var grid_search_list = dom.byId('id_grid_cells');
                var grid_update_list = dom.byId('id_edit_new_grid_cells');

                var grid_cells = Array.map(featureSet.features, function(feature) {
                    var deferred = new Deferred();
                    var grid_cell = feature.attributes.GRID;
                    return deferred.resolve(grid_cell);
                });

                all(grid_cells).then(function(array) {
                    var selectionSymbol = new SimpleFillSymbol(
                        SimpleFillSymbol.STYLE_SOLID,
                         new SimpleLineSymbol(SimpleLineSymbol.STYLE_DASHDOT,
                            new Color([255, 0, 0]), 2),
                             new Color([255, 255, 0, 0.5]
                                )
                             );
                    layer.setSelectionSymbol(selectionSymbol);
                    // sort the array in alpha numerical order
                    array.sort();

                    // update the Search Text box with grid values
                    grid_search_list.value = array;
                    // add the New Grid Cells to the update box as checkboxes
                    Array.forEach(array, function(e) {

                        var li = domConstruct.create("li");
                        var label = domConstruct.create("label", {"for" : e+"_id", innerHTML: e});
                        var input = domConstruct.create("input", {"type": "checkbox", "name": "edit_new_grid_cells", "value": e,
                            "id": e+"_id", "checked": true, "class": "form-control"});
                        on(input, "change", function(evt) {
                          var query = new Query();
                          var exp = "GRID = '"+evt.target.value+"'";
                          query.where = exp;

                          if (evt.target.checked) {
                            // add the cell to the definition query
                            layer.selectFeatures(query, FeatureLayer.SELECTION_ADD, function(e) {
                                console.log(e);
                                layer.redraw();
                            });
                          } else {
                            // remove the cell from the definition query
                            layer.selectFeatures(query, FeatureLayer.SELECTION_SUBTRACT, function(e) {
                                console.log(e);
                                layer.redraw();
                            });
                          }
                        });

                        domConstruct.place(label, li);
                        domConstruct.place(input, label);
                        domConstruct.place(li, grid_update_list);

                    });

                    
                    var defExp = "GRID IN ('"+ array.join("', '") + "')";                    
                    layer.setDefinitionExpression(defExp);

                    layer.show();
                    layer.refresh();

                    var query = new Query();
                    query.where = defExp;
                    // initially all the cells are selected using the same definition query as the def expression.
                    // the checkboxes allow the user to toggle cell selection to disclude them from the post data
                    layer.selectFeatures(query, FeatureLayer.SELECTION_NEW, function(e) {
                        console.log(e);
                    });
                });
            });
        }
    });
});