import jQuery from 'jquery'

var options = {
  globalProperties: {
    page_url: window.location.href,
    referrer_url: document.referrer,
  }
}

// create a common namespace with options
var CommonWeb = {
  options: options
}

CommonWeb.addGlobalProperties = function (properties) {
  jQuery.extend(CommonWeb.options.globalProperties, properties)
}

// initiate user tracking, using a GUID stored in a cookie
// The user can pass in a custom cookie name and custom GUID, if they would like
CommonWeb.trackSession = function (cookieName, defaultGuid) {
  if (typeof(cookieName) !== "string") {
    cookieName = "common_web_guid";
  }

    // Look for the GUID in the currently set cookies
    var cookies = document.cookie.split('; ');
    var guid = null;
    var cookieParts;

    for (var i = 0; i < cookies.length; i++) {
      cookieParts = cookies[i].split('=');
      if (cookieParts[0] === cookieName) {
            // Got it!
            guid = cookieParts[1];
            break;
          }
        }

    // We didn't find our guid in the cookies, so we need to generate our own
    if (guid === null) {
      if (typeof(defaultGuid) === "string") {
        guid = defaultGuid;
      } else {
        var genSub = function () {
          return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
        };

        guid = genSub() + genSub() + "-" + genSub() + "-" +
        genSub() + "-" + genSub() + "-" + genSub() + genSub() + genSub();
      }

      var cookie_string = cookieName + "=" + guid + "; path/;";
      document.cookie = cookie_string;

    }

    CommonWeb.addGlobalProperties({guid: guid});

    return guid;
  };

/**
 * Pageview tracking hooks
 * @param moreProperties
 * @return CommonWeb.Callback
*/
CommonWeb.trackPageview = function (moreProperties) {
  var defaultProperties = CommonWeb.options.globalProperties;
  var properties = jQuery.extend(true, {}, defaultProperties, toProperties(moreProperties));

  CommonWeb.Callback(properties);
};

/**
 * Track click events from links
 * @param elements
 * @param moreProperties
 * @return CommonWeb.Callback
*/
CommonWeb.trackClicks = function (addEvtListener, elements, moreProperties) {
  const evtType = 'click'
  if (typeof elements === 'undefined') {
    elements = document.querySelectorAll("a");
  }

  if (!addEvtListener) {
    return CommonWeb.removeEvtListener(elements, evtType)
  }

  jQuery.each(elements, (idx, elem) => {
    jQuery(elem).on(evtType, (evt) => {
      const props = toClickProperties(evt, elem, moreProperties);

      doClick(props, elem, evt);
    });
  });
};

/**
 * Track click events from elements that are not links
 * @param elements
 * @param moreProperties
 * @return CommonWeb.Callback
*/
CommonWeb.trackClicksPassive = function (addEvtListener, elements, moreProperties) {
  const evtType = 'click'
  if (typeof elements === 'undefined') {
    elements = jQuery("button, :submit, i");
  }

  if (!addEvtListener) {
    return CommonWeb.removeEvtListener(elements, evtType)
  }

  jQuery.each(elements, (idx, elem) => {
    jQuery(elem).on(evtType, (evt) => {
      const props = toClickPassiveProperties(evt, elem, moreProperties);

      doClick(props, elem, evt);
    });
  });
};

function doClick(props, elem, evt) {
  const pageWillUnload = elem.href && elem.target !== '_blank' && !isMetaKey(evt) || elem.type === 'submit';
  let unloadCallback = function () {};
  // let errorInstance = false;

  // if the page will unload, don't let the JS evt bubble but navigate to the href after the click
  if (pageWillUnload) {
    evt.preventDefault();

    // only need to refresh the page
    // TODO: how about query parameters that are submitted on form submission???
    if (elem.type === 'submit') {
      unloadCallback = () => window.location.href = window.location.href;
    } else {
      // errorInstance = isNotSameDomain(elem.href);

      unloadCallback = () => window.location.href = elem.href;
    }
  }

  CommonWeb.Callback(props, unloadCallback);
}

/**
 * Track for input change events
 * @param elements
 * @param moreProperties
 * @return CommonWeb.Callback
*/
CommonWeb.trackInputChanges = function (addEvtListener, elements, moreProperties) {
  const evtType = 'change'
  if (typeof elements === 'undefined') {
    elements = jQuery("input, textarea");
  }

  if (!addEvtListener) {
    return CommonWeb.removeEvtListener(elements, evtType)
  }

  jQuery.each(elements, function (index, element) {
    const currentValue = jQuery(element).val();

    jQuery(element).on(evtType, function (event) {
      var properties = toChangeProperties(event, element, currentValue, moreProperties);

      CommonWeb.Callback(properties);
    });
  });
};

CommonWeb.removeEvtListener = function(elements, evtType) {
  jQuery.each(elements, (idx, elem) => {
    jQuery(elem).off(evtType)
  })
}

/**
 * Track for select input change events
 * @param elements
 * @param moreProperties
 * @return CommonWeb.Callback
*/
CommonWeb.trackSelectInputChanges = function (addEvtListener, elements, moreProperties) {
  const evtType = 'change'
  if (typeof elements === 'undefined') {
    elements = document.querySelectorAll("select");
  }

  if (!addEvtListener) {
    return CommonWeb.removeEvtListener(elements, evtType)
  }

  jQuery.each(elements, function (index, element) {
    const currentValue = jQuery(element).val();
    const currentTextValue = jQuery(element)
      .find('option')
      .filter((idx, elem) => currentValue === jQuery(elem).val())
      .text();

    jQuery(element).on(evtType, function (event) {
      const properties = toSelectChangeProperties(event, element, currentTextValue, currentValue, moreProperties);

      CommonWeb.Callback(properties);
    });
  });
};

/**
 * Tranformations of events and elements to properties override as a workaround to add / remove properties
 */
CommonWeb.Transformations = {
  eventToProperties: function (evt) {
    var props = {};

    props.scrollTop = evt.target.offsetTop;
    props.timeStamp = evt.timeStamp;
    props.type = evt.type;
    props.metaKey = evt.metaKey;

    return props;
  },
  elementToProperties: function (elem, extraProps) {
    let props = extraProps || {};
    const classes = jQuery(elem).attr('class');

    props.tagName = elem.tagName;
    props.path = jQuery(elem).getPath();

    if (classes) {
      props.classes = classes.split(/\s+/);
    }

    jQuery(elem.attributes).each(function (index, attr) {
      props[attr.nodeName] = attr.value;
    });

    return props;
  },
  clickElementToProperties: function (clickElem) {
    let clickProps = {};

    clickProps.text = clickElem.innerText;

    return this.elementToProperties(clickElem, this.appendProperties(clickElem, clickProps));
  },
  clickPassiveElementToProperties: function (clickPassiveElem) {
    let clickPassiveProps = {};

    if (clickPassiveElem.tagName === 'BUTTON')
      clickPassiveProps.text = clickPassiveElem.innerText;

    if (clickPassiveElem.tagName === 'INPUT')
      clickPassiveProps.value = clickPassiveElem.value;

    return this.elementToProperties(clickPassiveElem, this.appendProperties(clickPassiveElem, clickPassiveProps));
  },
  formElementToProperties: function (formElem) {
    return {
      form_values: jQuery(formElem).serializeArray(),
      form: this.elementToProperties(formElem)
    }
  },
  inputElementToProperties: function (inputElem, extraProps) {
    let inputProps = extraProps || {};

    inputProps.value = inputElem.value;

    return this.elementToProperties(inputElem, this.appendProperties(inputElem, inputProps));
  },
  selectElementToProperties: function(selectElem, extraProps) {
    let selectProps = extraProps || {};

    selectProps.value = selectElem.value,
    selectProps.text = selectElem.selectedOptions[0].innerText

    return this.elementToProperties(selectElem, this.appendProperties(selectElem, selectProps));
  },

  /**
   * Append additional properties to all types of elements
   *
   * form properties
   */
   appendProperties: function(element, obj) {
    const parentForm = jQuery(element).closest('form');
    let additionalProperties = {};

    if (parentForm.length > 0) {
      jQuery.extend(additionalProperties, this.formElementToProperties(parentForm[0]));
    }

    return jQuery.extend(obj, additionalProperties);
  }
};

/**
 * Get click event properties
 * @param event
 * @param element
 * @param moreProperties
 * @return
 */
 function toClickProperties(event, element, moreProperties) {
  const defaultProperties = CommonWeb.options.globalProperties;
  const properties = jQuery.extend(true, {}, defaultProperties, toProperties(moreProperties, [event, element]));
  const eventProperties = {event: CommonWeb.Transformations.eventToProperties(event)};
  const elementProperties = {element: CommonWeb.Transformations.clickElementToProperties(element)};

  return jQuery.extend(true, {}, properties, elementProperties, eventProperties);
}

/**
 * Get button click event properties
 * @param event
 * @param element
 * @param moreProperties
 * @return
 */
 function toClickPassiveProperties(event, element, moreProperties) {
  const defaultProperties = CommonWeb.options.globalProperties;
  const properties = jQuery.extend(true, {}, defaultProperties, toProperties(moreProperties, [event, element]));
  const eventProperties = {event: CommonWeb.Transformations.eventToProperties(event)};
  const elementProperties = {element: CommonWeb.Transformations.clickPassiveElementToProperties(element)};

  return jQuery.extend(true, {}, properties, elementProperties, eventProperties);
}

/**
 * Get change event properties
 * @param event
 * @param elements
 * @param previousValue
 * @param moreProperties
 * @return
 */
 function toChangeProperties(event, element, previousValue, moreProperties) {
  const defaultProperties = CommonWeb.options.globalProperties;
  const extraProps = {previousValue: previousValue};
  const properties = jQuery.extend(true, {}, defaultProperties, toProperties(moreProperties, [event, element]));
  const eventProperties = {event: CommonWeb.Transformations.eventToProperties(event)};
  let elementProperties = {element: CommonWeb.Transformations.inputElementToProperties(element, extraProps)};

  return jQuery.extend(true, {}, properties, elementProperties, eventProperties);
}

/**
 * Get select change event properties
 * @param event
 * @param elements
 * @param previousValue
 * @param moreProperties
 * @return
 */
 function toSelectChangeProperties(event, element, previousText, previousValue, moreProperties) {
  const defaultProperties = CommonWeb.options.globalProperties;
  const extraProps = {previousText: previousText, previousValue: previousValue};
  const properties = jQuery.extend(true, {}, defaultProperties, toProperties(moreProperties, [event, element]));
  const eventProperties = {event: CommonWeb.Transformations.eventToProperties(event)};
  let elementProperties = {element: CommonWeb.Transformations.selectElementToProperties(element, extraProps)};

  return jQuery.extend(true, {}, properties, elementProperties, eventProperties);
}

/**
 * Get submit event properties
 * @param event
 * @param element
 * @param moreProperties
 * @return
 */
 function toSubmitProperties(event, element, moreProperties) {
  var defaultProperties = CommonWeb.options.globalProperties;
  var properties = jQuery.extend(true, {}, defaultProperties, toProperties(moreProperties, [event, element]));
  var elementProperties = {element: CommonWeb.Transformations.formElementToProperties(element)};
  var eventProperties = {event: CommonWeb.Transformations.eventToProperties(event)};

  return jQuery.extend(true, {}, properties, elementProperties, eventProperties);
}

/**
 * UTILITY FUNCTIONS
 */
 function toProperties(propertiesOrFunction, args) {
  if (typeof propertiesOrFunction === 'function') {
    return propertiesOrFunction.apply(window, args);
  } else {
    return propertiesOrFunction;
  }
}

function isMetaKey(event) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

// This is the improved getPath that doesn't use class names but uses nth-child/id
jQuery.fn.extend({
    /**
     * Get path to element
     *
     * Usage: var path = $('#foo').getPath();
     * @return
     */
     getPath: function () {
      return this.cssSelector(this.get(0));
    },
    /**
     * Generate a CSS selector string to target the given node
     *
     * @param  {HTMLElement} el     Node to target
     * @return {string}             CSS selector
     */
     cssSelector: function(el) {
      let names = [];
      while (el.parentNode) {
        if (el.id) {
                // only use the first id name if an element has multiple
                el.id = el.id.split(' ')[0]
                // check DOM if a duplicate ID is found in the DOM
                const nodeList = document.querySelectorAll('[id]'),
                nodeArray = [].slice.call(nodeList);

                const dups = nodeArray
                .filter((elem) => elem.id === el.id)
                .length;

                // if duplicate ID's found, get the path & the id `A#testingID1:nth-child(2)`
                if (dups > 1) {
                  getThePath(`#${el.id}`);
                } else {
                  names.unshift(`${el.tagName}#${el.id}`);
                }
              } else {
                getThePath();
              }

              el = el.parentNode;
            }

            function getThePath(elementID) {
              const id = elementID || '';

              if (el === el.ownerDocument.documentElement || el === el.ownerDocument.body)
                return names.unshift(el.tagName);

              let c = 1;
              for (let e = el; e.previousElementSibling; e = e.previousElementSibling, c++) {}

                const path = `${el.tagName}${id}:nth-child(${c})`;
              return names.unshift(path);
            }

            return names.join(' > ');
          }
        });

module.exports = CommonWeb;
