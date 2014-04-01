/*
***************************************************************************
 topology.js - built as a library

 v0.7 by Ziad Sawalha, Mar 25, 2014

 Usage:

   var my_diagram = topology.diagram("#my_div", {height: 200}).draw(data)

 Requires:

   jQuery, bootstrap, d3, _.underscore, and icons (see DEFAULT_ICON_ROOT)
   Also topology.css

***************************************************************************
*/

/* JSHint Directives */
/* global d3 */
/* global _ */
/* global $ */

var topology = (function(topology, $, _, d3, console) {
  'use strict';
  // Check dependencies (I made them injectable for future testing)
  if (typeof topology === 'undefined') {
    topology = {};
  } else {
    console.log('Reloading topology.js');
  }
  if (typeof $ === 'undefined') {
    console.error('jQuery not loaded. topology.js requires it');
  }
  if (typeof _ === 'undefined') {
    console.error('_.underscore not loaded. topology.js requires it');
  }
  if (typeof d3 === 'undefined') {
    console.error('d3 not loaded. topology.js requires it');
  }
  if (typeof topology === 'undefined') {
    topology = {};
  }
  if (typeof $().popover !== 'function') {
    throw 'Bootstrap Popover Required, but does not seem to be installed.';
  }

  //
  //private vars and functions (in library scope only)
  //
  var root = this; // if we ever need to refer to this - it's "window" in browsers

  // Check if an object is an array (http://shop.oreilly.com/product/9780596517748.do)
  function isQrray(value) {
    return value &&
        typeof value === 'object' &&
        typeof value.length === 'number' &&
        typeof value.splice === 'function' &&
        !(value.propertyIsEnumerable('length'));
  }

  // Capitalize first letter
  function toTitleCase(str) {
    return str.replace(/wS*/g, function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
  }

  // Trim long text with '...'
  function snippit(d, chars) {
    if (d) {
      if (d.length > (chars || 30)) {
        return d.substr(0, chars || 30) + '...';
      } else {
        return d;
      }
    }
    return '';
  }

  /*
   * Deep find in an object. Returns all instances of objects that have
   * obj[propertyName] == value. If value is undefined, then it returns
   * all objects that have the property propertyName.
  */
  function deepFind(theObject, propertyName, value, results) {
    if (!(results instanceof Array)) {
      results = [];
    }

    if (theObject instanceof Array) {
      for(var i = 0; i < theObject.length; i++) {
        deepFind(theObject[i], propertyName, value, results);
      }
    } else {
      for(var prop in theObject) {
        if (prop === propertyName) {
          if(typeof value === 'undefined' || theObject[prop] === value) {
            results.push(theObject);
          }
        }
        if (theObject[prop] instanceof Object || theObject[prop] instanceof Array) {
          deepFind(theObject[prop], propertyName, value, results);
        }
      }
    }
    return results;
  }

  var DEFAULT_ICON_ROOT = 'https://289d1f3753d5f066ce31-858f474b0c2ae883d2020e5da9286545.ssl.cf2.rackcdn.com/',
      IMAGE_SIZE = 150,
      NODE_HEADER=55,
      NODES_LEFT_MERGIN = 70,
      NODE_WIDTH = 80,
      NODE_BOTTOM_MARGIN = 30,
      NODE_SEPARATOR = 5,
      SERVICE_HEIGHT=20,
      RESOURCE_TYPES = ['compute', 'load-balancer', 'database', 'application'];

  // Set up SVG definitions
  function setupDefinitions(svg, resourceTypes, statusColors, iconRoot) {
    if (typeof resourceTypes === 'undefined') {
      resourceTypes = RESOURCE_TYPES;
    }
    if (typeof statusColors === 'undefined') {
      statusColors = ['black', 'gray', 'green', 'orange', 'red'];
    }
    if (typeof iconRoot === 'undefined') {
      iconRoot = DEFAULT_ICON_ROOT;
    }

    var defs = svg.append('defs');

    _.each(resourceTypes, function(rtype) {
      // Plain, colorless icons
      defs.append('pattern')
        // pattern is set up to fit in bounding rectangle so that size is determined when the pattern is applied
        .attr('id', rtype + '-icon')
        .attr('patternUnits', 'objectBoundingBox')
        .attr('width', 1)
        .attr('height', 1)
        .attr('x', 0)
        .attr('y', 0)
        .attr('viewBox', '0 0 100 100')
        .attr('patternContentUnits', 'objectBoundingBox')
        .append('image')
          .attr('xlink:href', iconRoot + rtype + '.svg')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', 100)
          .attr('height', 100);
      // Status (colored) icons for each type
      _.each(statusColors, function(color) {
        defs.append('pattern')
          .attr('id', rtype + '-' + color + '-icon')
          .attr('patternUnits', 'objectBoundingBox')
          .attr('width', 1)
          .attr('height', 1)
          .attr('x', 0)
          .attr('y', 0)
          .append('image')
            .attr('xlink:href', iconRoot + rtype + '-' + color + '.svg')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', 20)
            .attr('height', 20);
      });
    });

    // Opinion icons
    _.each(['icon-alert-circled', 'icon-checkmark-circled', 'icon-close-circled'], function(rtype) {
      defs.append('pattern')
        .attr('id', rtype + '-icon')
        .attr('patternUnits', 'objectBoundingBox')
        .attr('width', 1)
        .attr('height', 1)
        .attr('x', 0)
        .attr('y', 0)
        .attr('viewBox', '0 0 100 100')
        .attr('patternContentUnits', 'objectBoundingBox')
        .append('image')
          .attr('xlink:href', iconRoot + rtype + '.svg')
          .attr('x', 0)
          .attr('y', 0)
          .attr('width', 100)
          .attr('height', 100);
    });

  }

  // Create a hidden popover content container for use with bootstrap popovers
  var popoverId = _.uniqueId();
  $('body').append('<div id="' + popoverId + '" style="display: none;"/>');

  //
  //public vars and functions (precede with "topology.")
  //

  /*
   * Constructor: create and return a new diagram object
   *
   * Pass in a jQuery selector pointing to the element to draw a
   * diagram under and a config object to control aspects of the diagram
   *
   * Config options:
   *
   *   height, width: default to 100
   *   border: true/false
   *
   * Example:
   *
   *  var my_diagram = topology.diagram("#my_div", {height: 200}).draw(data)
   *
  */
  topology.diagram = function(selector, config) {
    var self = this;
    self.config = config;
    self.height = config.height || 100;
    self.width = config.width || 100;
    self.parent = d3.selectAll(selector);
    self.id = _.uniqueId('diagram_');
    self.canvas = self.parent.selectAll('#' + self.uniqueId)
      .data([1]).enter().append('svg')
          .attr('width', self.width)
          .attr('height', self.height)
          .attr('id', self.id)
          .attr('class', 'canvas');
    setupDefinitions(self.canvas, config.resourceTypes, config.colors, config.iconRoot);

    // Draw a topology diagram
    self.draw = function(data) {
      self.data = self.prepareData(data);
      self.maxNodes = _.max(_.map(data.tiers, function(tier) {return _.size(tier.resources || {});}));

      // draw border
      if (self.config.border === true) {
        self.canvas.append('rect')
         .attr('x', 0)
         .attr('y', 0)
         .attr('width', self.width).attr('height', self.height)
         .attr('class', 'border');
      }

      // draw tiers
      self.tiers = self.drawTiers(d3.entries(self.data.tiers));
      self.drawConnections(self.data);
      $('.topology-tooltip').tooltip({
        delay: {show: 10, hide: 100 },
        container:'body',
        html: true,
        placement: 'auto bottom'
      });
      return self;
    };

    // Clean up, prepare, and index data for drawing
    self.prepareData = function(data) {
      if (Object.getOwnPropertyNames(data || {}).indexOf('tiers') === -1) {
        throw 'No \'tiers\' key in data';
      }

      var maxNodes = 0;
      _.each(data.tiers, function(tier, key) {
        // Find services running more than once on a single server
        maxNodes = Math.max(maxNodes, _.size(tier.resources));
        var dupes = [];
        _.each(tier.resources, function(v, k) {
          v.tier = key; // mark each resource with its tier
          if (isQrray(v.services)) {
            var nodeServices = [];
            _.each(v.services, function(svc) {
              if (typeof svc.process === 'string') {
                if (nodeServices.indexOf(svc.process) === -1) {
                  nodeServices.push(svc.process);
                } else {
                  if (dupes.indexOf(svc.process) === -1) {
                    dupes.push(svc.process);
                  }
                }
              }
            });
          }
        });

        // Get unique service[:port] list for this tier
        var services = [];
        _.each(tier.resources, function(resource, k) {
          if (isQrray(resource.services)) {
            _.each(resource.services, function(svc) {
              if (typeof svc.process === 'string') {
                if (dupes.indexOf(svc.process) === -1) {
                  services.push(svc.process);
                } else {
                  services.push(svc.process + (svc.port ? ':' + svc.port : ''));
                }
              }
            });
          }
        });
        tier.services = _.uniq(services).sort();

        // Index each service in each resource so we can use it when rendering node services
        _.each(tier.resources, function(v, k) {
          if (isQrray(v.services)) {
            _.each(v.services, function(svc) {
              if (typeof svc.process === 'string') {
                var index = tier.services.indexOf(svc.process + (svc.port ? ':' + svc.port : ''));
                if (index === -1) {
                  index = tier.services.indexOf(svc.process);
                }
                svc.index = index;
              }
            });
          }
        });

        // Get host opinions
        if (Object.getOwnPropertyNames(data || {}).indexOf('opinions') > -1) {
          _.each(tier.resources, function(resource, k) {
            var opinions = resource.opinions || [];
            $.merge(opinions, d3.values(data.opinions.hosts[k]));
            if (opinions.length > 0) {
              resource.opinions = opinions;
            }
          });
        }

        _.each(tier.resources, function(resource, k) {
          // Group host opinions by status
          if (isQrray(resource.opinions)) {
            resource.groupedOpinions = _.groupBy(resource.opinions, 'status');
          }
        });

      });

      // Calculate coords
      var totalWidth = maxNodes * (NODE_WIDTH + NODE_SEPARATOR);
      var tierGravity = {  // determines where to place that tier vertically
        dns: 5,
        lb: 10,
        _default: 50,
        db: 100,
        database: 100
      };
      var tierY = 5;
      var keys = _.keys(data.tiers);
      keys = _.sortBy(keys, function(key){return tierGravity[key] || tierGravity._default;});
      _.each(keys, function(key) {
        var tier = data.tiers[key];
        // Tier y-coords
        tier.height = NODE_HEADER + 40 + (tier.services.length * SERVICE_HEIGHT);
        tier.y = tierY;
        tierY += tier.height + 5;

        // Tier node distribution
        var tierResourceCount = _.size(tier.resources);
        tier.nodeOffset = (totalWidth - (_.size(tier.resources) * (NODE_WIDTH + NODE_SEPARATOR))) / 2 ;
      });

      return data;
    };

    // Draw tier boxes (and the nodes in the tier)
    self.drawTiers = function(tiers) {
      var results = this.canvas.selectAll('.tier').data(tiers).enter()
        .append('g')
          .attr('id', function(d) {return 'tier_' + d.key;})
          .attr('class', 'tier')
          .attr('transform', function(d, index) {
            d.x = 0;
            d.y = d.value.y;
            d.height = d.value.height;
            return 'translate(' + [d.x, d.y] + ')';
          });
      results.append('rect')
        .attr('x', 1)
        .attr('y', 3)
        .attr('rx', 5)
        .attr('width', (this.width) - 2)
        .attr('height', function(d) {return d.height - 6;});
      results.append('text')
        .attr('x', 4)
        .attr('y', 16)
        .attr('class', 'title')
        .text(function(d) {return d.key || 'n/a';});
      // draw nodes and services
      self.nodes = results.call(self.drawTierNodes);
      self.services = results.call(self.drawTierServices);
      return results;
    };

    // Draw the nodes for each a tier
    self.drawTierNodes = function(tiers) {
      var calculatedWidth = (self.width - NODES_LEFT_MERGIN) / self.maxNodes;

      var nodes = tiers.selectAll('.resource')
        .data(function(tier) {
          return d3.entries(tier.value.resources);
        })
        .enter()
        .append('g')
          .attr('id', function(d) {return 'id_' + d.value.id || _.uniqueId();})
          .attr('class', 'resource')
          .attr('transform', function(d, i) {
            d.x = self.data.tiers[d.value.tier].nodeOffset + (i * calculatedWidth) + NODES_LEFT_MERGIN;
            d.y = 20;
            return 'translate(' + [d.x, d.y] + ')';
          })
          .on('click', function(d) {
            self.onClick(this, d);
          });
      nodes.append('rect')
        .attr('rx', '10').attr('ry', '10')
        .attr('width', calculatedWidth - 5)
        .attr('height', function(d) {
          return (self.data.tiers[d.value.tier].services.length * SERVICE_HEIGHT) + NODE_HEADER + 10;
        })
        .attr('class', 'resource-border');
      nodes.append('rect')
         .attr('class', 'resource-icon')
        .attr('x', calculatedWidth - 30)
        .attr('width', 20)
        .attr('height', 20)
        .style('fill', function(d) {
          if ('type' in d.value && RESOURCE_TYPES.indexOf(d.value.type) !== -1) {
            if ('status' in d.value) {
              return 'url(#' + d.value.type + '-' + d.value.status + '-icon)';
            } else {
              return 'url(#' + d.value.type + '-icon)';
            }
          } else {
            return 'transparent';
          }
        });
      nodes.append('text')
       .attr('y', 20)
       .attr('x', 4)
       .attr('class', 'title')
       .text(function(d) {return snippit(d.value.name || d.key, 8) || 'n/a';});

      // draw node opinons
      nodes.selectAll('.opinion')
        .data(function(node) {
          return d3.entries(node.value.groupedOpinions);
        })
        .enter()
        .append('g')
          .attr('class', 'opinion-box')
          .attr('transform', function(d, i) {
            d.x = 0;
            d.y = 20;
            return 'translate(' + [d.x, d.y] + ')';
          })
          .append('rect')
            .attr('class', 'opinion topology-tooltip')
            .attr('title', function(d) {
              return '<h5 style="text-align: left;">Status \"' + d.key + '\"</h5>' + _.reduce(d.value, function(memo, entry){ return memo + '<p style="text-align: left;">- ' + entry.description + '</p>';}, '');
            })
            .attr('y', 4)
            .attr('x', function(d, i) {return 4 + i * 10;})
            .attr('width', 10)
            .attr('height', 10)
            .style('fill', function(d) {
              var status = (d.key || '').toLowerCase();
              if (status === 'ok') {
                  return 'url(#icon-checkmark-circled-icon)';
              } else if (status.substr(0, 3) === 'err') {
                  return 'url(#icon-close-circled-icon)';
              } else if (status.substr(0, 4) === 'warn') {
                  return 'url(#icon-alert-circled-icon)';
              } else {
                return 'transparent';
              }
            });

      nodes.append('text')
       .attr('y', 45)
       .attr('x', 4)
       .attr('class', 'resource-text')
       .text(function(d) {return d.value.type || 'n/a';});

      nodes.append('line')
        .attr('y1', NODE_HEADER)
        .attr('y2', NODE_HEADER)
        .attr('x2', calculatedWidth - 4)
        .attr('class', 'resource-underline');

      // draw service entries
      var entries = nodes.selectAll('.service_entry')
        .data(function(node) {
          return node.value.services || [];
        })
        .enter()
        .append('g')
          .attr('class', function(d) {return 'service-entry service_' + d.status;})
          .attr('transform', function(d, i) {
            d.x = 4;
            d.y = ((d.index+1) * SERVICE_HEIGHT) + NODE_HEADER - 6;
            return 'translate(' + [d.x, d.y] + ')';
          });
      entries.append('text')
          .text(function(d) {return d.port || 'n/a';});
      entries.selectAll('.opinion')
        .data(function(service) {return service.opinions || [];}).enter()
        .append('rect')
          .attr('class', 'opinion topology-tooltip')
          .attr('title', function(d) {return '<h5 style="text-align: left;">Status \"' + d.status + '\"</h5><p style="text-align: left;">- ' + d.description + '</p>';})
          .attr('y', -10)
          .attr('x', function(d, i) {return calculatedWidth - 12 - ((i + 1) * 10);})
          .attr('width', 10)
          .attr('height', 10)
          .style('fill', function(d) {
            var status = (d.status || '').toLowerCase();
            if (status === 'ok') {
                return 'url(#icon-checkmark-circled-icon)';
            } else if (status.substr(0, 3) === 'err') {
                return 'url(#icon-close-circled-icon)';
            } else if (status.substr(0, 4) === 'warn') {
                return 'url(#icon-alert-circled-icon)';
            } else
              return 'transparent';
          });

      return nodes;
    };

    // Draw services bars across nodes in a tier
    self.drawTierServices = function(tiers) {
      var services = tiers.selectAll('.service')
        .data(function(tier) {return _.map(tier.value.services || [], function(d) {return {key: d};});})
        .enter()
        .append('g')
          .attr('class', 'service')
          .attr('transform', function(d, i) {
            d.x = 5;
            d.y = ((i+1) * SERVICE_HEIGHT) + NODE_HEADER;
            return 'translate(' + [d.x, d.y] + ')';
          });
      services.append('line')
        .attr('y1', SERVICE_HEIGHT)
        .attr('y2', SERVICE_HEIGHT)
        .attr('x2', self.config.width - 5)
        .attr('class', 'service-underline');
      services.append('text')
        .attr('y', 15)
        .attr('class', 'title')
        .text(function(d) {return d.key.split(':')[0];});
      return services;
    };

    // Draw connections between nodes
    self.drawConnections = function(data) {
      _.each(data.tiers, function(tier, tkey) {
        _.each(tier.resources, function(resource, rkey) {
          _.each(resource.connections, function(connection) {
            self.drawConnection('#id_' + resource.id, '#id_' + connection.id, 'connection_' + connection.status);
          });
        });
      });
    };

    // Draw a connection between two nodes using their ids
    self.drawConnection = function(from, to, status) {
      //Temporary Hack, to skip connections without a known endpoint
      if(to=="#id_UNKNOWN") {
        return null;
      }
      
      var source = d3.select(from)[0][0].__data__;
      var target = d3.select(to)[0][0].__data__;
      var sourceTier = d3.select('#tier_' + source.value.tier)[0][0].__data__;
      var targetTier = d3.select('#tier_' + target.value.tier)[0][0].__data__;
      self.canvas.append('line')
        .attr('class', 'link topology-tooltip')
        .attr('title', function(d) {
          return status;})
        .classed(status, 1)
        .attr('x1', source.x + sourceTier.x + NODE_WIDTH/2)
        .attr('y1', source.y + 1 + sourceTier.y + sourceTier.height - NODE_BOTTOM_MARGIN)
        .attr('x2', target.x + targetTier.x + NODE_WIDTH/2)
        .attr('y2', target.y + targetTier.y);
    };

    self.onClick = function(element, node) {
      $('.popover-marker').popover('hide');
      _.each($('.popover-marker'), function(e) {e.classList.remove('popover-marker');});

      var content = '<table>';
      content += '<tr><td>Name:</td><td>' + node.key + '</td></tr>';
      content += '<tr><td>Type:</td><td>' + node.value.type + '</td></tr>';
      if ('id' in node) {
        content += '<tr><td>ID:</td><td>' + node.value.id + '</td></tr>';
      }
      if ('status' in node) {
        content += '<tr><td>Status:</td><td>' + node.value.status + '</td></tr>';
      }
      if (typeof node.value.url === 'string') {
        content += '<tr><td>URL:</td><td><a href="' + node.value.url + '"  target="_blank">' + node.value.url + '</a></td></tr>';
      }
      _.each(node.info, function(d, k) {
        content += '<tr><td>' + toTitleCase(k) + '</td><td>' + d + '</td></tr>';
      });
      $('#' + popoverId).html('<table>' + content + '</table>');
      $(element).popover({
        title: node.value.type + ': ' + node.key,
        trigger: 'manual',
        html : true,
        content: function() {return $('#' + popoverId).html();},
        container: 'body'
      }).click(function(e) {
        e.preventDefault() ;
      }).popover('show');
      element.classList.add('popover-marker');

      // handle clicking on the popover itself
      $('.popover').off('click').on('click', function(e) {
        e.stopPropagation(); // prevent event for bubbling up => will not get caught with document.onclick
      });

    };

    return self;  //diagram instance
  };

  return topology;
}).call(this, topology, this.$ || jQuery, this._ || _, this.d3 || d3, console);
