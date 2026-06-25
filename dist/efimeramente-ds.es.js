import Oe from "react";
var U = { exports: {} }, I = {};
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var we;
function fr() {
  if (we) return I;
  we = 1;
  var u = Oe, v = Symbol.for("react.element"), p = Symbol.for("react.fragment"), c = Object.prototype.hasOwnProperty, g = u.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, h = { key: !0, ref: !0, __self: !0, __source: !0 };
  function y(j, b, w) {
    var R, T = {}, C = null, L = null;
    w !== void 0 && (C = "" + w), b.key !== void 0 && (C = "" + b.key), b.ref !== void 0 && (L = b.ref);
    for (R in b) c.call(b, R) && !h.hasOwnProperty(R) && (T[R] = b[R]);
    if (j && j.defaultProps) for (R in b = j.defaultProps, b) T[R] === void 0 && (T[R] = b[R]);
    return { $$typeof: v, type: j, key: C, ref: L, props: T, _owner: g.current };
  }
  return I.Fragment = p, I.jsx = y, I.jsxs = y, I;
}
var $ = {};
/**
 * @license React
 * react-jsx-runtime.development.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var je;
function dr() {
  return je || (je = 1, process.env.NODE_ENV !== "production" && (function() {
    var u = Oe, v = Symbol.for("react.element"), p = Symbol.for("react.portal"), c = Symbol.for("react.fragment"), g = Symbol.for("react.strict_mode"), h = Symbol.for("react.profiler"), y = Symbol.for("react.provider"), j = Symbol.for("react.context"), b = Symbol.for("react.forward_ref"), w = Symbol.for("react.suspense"), R = Symbol.for("react.suspense_list"), T = Symbol.for("react.memo"), C = Symbol.for("react.lazy"), L = Symbol.for("react.offscreen"), Z = Symbol.iterator, Ce = "@@iterator";
    function Se(e) {
      if (e === null || typeof e != "object")
        return null;
      var r = Z && e[Z] || e[Ce];
      return typeof r == "function" ? r : null;
    }
    var k = u.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    function m(e) {
      {
        for (var r = arguments.length, t = new Array(r > 1 ? r - 1 : 0), n = 1; n < r; n++)
          t[n - 1] = arguments[n];
        Pe("error", e, t);
      }
    }
    function Pe(e, r, t) {
      {
        var n = k.ReactDebugCurrentFrame, i = n.getStackAddendum();
        i !== "" && (r += "%s", t = t.concat([i]));
        var s = t.map(function(o) {
          return String(o);
        });
        s.unshift("Warning: " + r), Function.prototype.apply.call(console[e], console, s);
      }
    }
    var ke = !1, Fe = !1, De = !1, Ne = !1, Ae = !1, Q;
    Q = Symbol.for("react.module.reference");
    function Ie(e) {
      return !!(typeof e == "string" || typeof e == "function" || e === c || e === h || Ae || e === g || e === w || e === R || Ne || e === L || ke || Fe || De || typeof e == "object" && e !== null && (e.$$typeof === C || e.$$typeof === T || e.$$typeof === y || e.$$typeof === j || e.$$typeof === b || // This needs to include all possible module reference object
      // types supported by any Flight configuration anywhere since
      // we don't know which Flight build this will end up being used
      // with.
      e.$$typeof === Q || e.getModuleId !== void 0));
    }
    function $e(e, r, t) {
      var n = e.displayName;
      if (n)
        return n;
      var i = r.displayName || r.name || "";
      return i !== "" ? t + "(" + i + ")" : t;
    }
    function ee(e) {
      return e.displayName || "Context";
    }
    function O(e) {
      if (e == null)
        return null;
      if (typeof e.tag == "number" && m("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), typeof e == "function")
        return e.displayName || e.name || null;
      if (typeof e == "string")
        return e;
      switch (e) {
        case c:
          return "Fragment";
        case p:
          return "Portal";
        case h:
          return "Profiler";
        case g:
          return "StrictMode";
        case w:
          return "Suspense";
        case R:
          return "SuspenseList";
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case j:
            var r = e;
            return ee(r) + ".Consumer";
          case y:
            var t = e;
            return ee(t._context) + ".Provider";
          case b:
            return $e(e, e.render, "ForwardRef");
          case T:
            var n = e.displayName || null;
            return n !== null ? n : O(e.type) || "Memo";
          case C: {
            var i = e, s = i._payload, o = i._init;
            try {
              return O(o(s));
            } catch {
              return null;
            }
          }
        }
      return null;
    }
    var S = Object.assign, N = 0, re, te, ne, ae, oe, ie, se;
    function le() {
    }
    le.__reactDisabledLog = !0;
    function Le() {
      {
        if (N === 0) {
          re = console.log, te = console.info, ne = console.warn, ae = console.error, oe = console.group, ie = console.groupCollapsed, se = console.groupEnd;
          var e = {
            configurable: !0,
            enumerable: !0,
            value: le,
            writable: !0
          };
          Object.defineProperties(console, {
            info: e,
            log: e,
            warn: e,
            error: e,
            group: e,
            groupCollapsed: e,
            groupEnd: e
          });
        }
        N++;
      }
    }
    function We() {
      {
        if (N--, N === 0) {
          var e = {
            configurable: !0,
            enumerable: !0,
            writable: !0
          };
          Object.defineProperties(console, {
            log: S({}, e, {
              value: re
            }),
            info: S({}, e, {
              value: te
            }),
            warn: S({}, e, {
              value: ne
            }),
            error: S({}, e, {
              value: ae
            }),
            group: S({}, e, {
              value: oe
            }),
            groupCollapsed: S({}, e, {
              value: ie
            }),
            groupEnd: S({}, e, {
              value: se
            })
          });
        }
        N < 0 && m("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
      }
    }
    var B = k.ReactCurrentDispatcher, J;
    function W(e, r, t) {
      {
        if (J === void 0)
          try {
            throw Error();
          } catch (i) {
            var n = i.stack.trim().match(/\n( *(at )?)/);
            J = n && n[1] || "";
          }
        return `
` + J + e;
      }
    }
    var q = !1, Y;
    {
      var Ye = typeof WeakMap == "function" ? WeakMap : Map;
      Y = new Ye();
    }
    function ue(e, r) {
      if (!e || q)
        return "";
      {
        var t = Y.get(e);
        if (t !== void 0)
          return t;
      }
      var n;
      q = !0;
      var i = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      var s;
      s = B.current, B.current = null, Le();
      try {
        if (r) {
          var o = function() {
            throw Error();
          };
          if (Object.defineProperty(o.prototype, "props", {
            set: function() {
              throw Error();
            }
          }), typeof Reflect == "object" && Reflect.construct) {
            try {
              Reflect.construct(o, []);
            } catch (E) {
              n = E;
            }
            Reflect.construct(e, [], o);
          } else {
            try {
              o.call();
            } catch (E) {
              n = E;
            }
            e.call(o.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (E) {
            n = E;
          }
          e();
        }
      } catch (E) {
        if (E && n && typeof E.stack == "string") {
          for (var a = E.stack.split(`
`), x = n.stack.split(`
`), f = a.length - 1, d = x.length - 1; f >= 1 && d >= 0 && a[f] !== x[d]; )
            d--;
          for (; f >= 1 && d >= 0; f--, d--)
            if (a[f] !== x[d]) {
              if (f !== 1 || d !== 1)
                do
                  if (f--, d--, d < 0 || a[f] !== x[d]) {
                    var _ = `
` + a[f].replace(" at new ", " at ");
                    return e.displayName && _.includes("<anonymous>") && (_ = _.replace("<anonymous>", e.displayName)), typeof e == "function" && Y.set(e, _), _;
                  }
                while (f >= 1 && d >= 0);
              break;
            }
        }
      } finally {
        q = !1, B.current = s, We(), Error.prepareStackTrace = i;
      }
      var D = e ? e.displayName || e.name : "", P = D ? W(D) : "";
      return typeof e == "function" && Y.set(e, P), P;
    }
    function Me(e, r, t) {
      return ue(e, !1);
    }
    function Ve(e) {
      var r = e.prototype;
      return !!(r && r.isReactComponent);
    }
    function M(e, r, t) {
      if (e == null)
        return "";
      if (typeof e == "function")
        return ue(e, Ve(e));
      if (typeof e == "string")
        return W(e);
      switch (e) {
        case w:
          return W("Suspense");
        case R:
          return W("SuspenseList");
      }
      if (typeof e == "object")
        switch (e.$$typeof) {
          case b:
            return Me(e.render);
          case T:
            return M(e.type, r, t);
          case C: {
            var n = e, i = n._payload, s = n._init;
            try {
              return M(s(i), r, t);
            } catch {
            }
          }
        }
      return "";
    }
    var A = Object.prototype.hasOwnProperty, ce = {}, fe = k.ReactDebugCurrentFrame;
    function V(e) {
      if (e) {
        var r = e._owner, t = M(e.type, e._source, r ? r.type : null);
        fe.setExtraStackFrame(t);
      } else
        fe.setExtraStackFrame(null);
    }
    function Ue(e, r, t, n, i) {
      {
        var s = Function.call.bind(A);
        for (var o in e)
          if (s(e, o)) {
            var a = void 0;
            try {
              if (typeof e[o] != "function") {
                var x = Error((n || "React class") + ": " + t + " type `" + o + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof e[o] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                throw x.name = "Invariant Violation", x;
              }
              a = e[o](r, o, n, t, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
            } catch (f) {
              a = f;
            }
            a && !(a instanceof Error) && (V(i), m("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", n || "React class", t, o, typeof a), V(null)), a instanceof Error && !(a.message in ce) && (ce[a.message] = !0, V(i), m("Failed %s type: %s", t, a.message), V(null));
          }
      }
    }
    var Be = Array.isArray;
    function K(e) {
      return Be(e);
    }
    function Je(e) {
      {
        var r = typeof Symbol == "function" && Symbol.toStringTag, t = r && e[Symbol.toStringTag] || e.constructor.name || "Object";
        return t;
      }
    }
    function qe(e) {
      try {
        return de(e), !1;
      } catch {
        return !0;
      }
    }
    function de(e) {
      return "" + e;
    }
    function ve(e) {
      if (qe(e))
        return m("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", Je(e)), de(e);
    }
    var pe = k.ReactCurrentOwner, Ke = {
      key: !0,
      ref: !0,
      __self: !0,
      __source: !0
    }, be, ge;
    function ze(e) {
      if (A.call(e, "ref")) {
        var r = Object.getOwnPropertyDescriptor(e, "ref").get;
        if (r && r.isReactWarning)
          return !1;
      }
      return e.ref !== void 0;
    }
    function Ge(e) {
      if (A.call(e, "key")) {
        var r = Object.getOwnPropertyDescriptor(e, "key").get;
        if (r && r.isReactWarning)
          return !1;
      }
      return e.key !== void 0;
    }
    function Xe(e, r) {
      typeof e.ref == "string" && pe.current;
    }
    function He(e, r) {
      {
        var t = function() {
          be || (be = !0, m("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", r));
        };
        t.isReactWarning = !0, Object.defineProperty(e, "key", {
          get: t,
          configurable: !0
        });
      }
    }
    function Ze(e, r) {
      {
        var t = function() {
          ge || (ge = !0, m("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", r));
        };
        t.isReactWarning = !0, Object.defineProperty(e, "ref", {
          get: t,
          configurable: !0
        });
      }
    }
    var Qe = function(e, r, t, n, i, s, o) {
      var a = {
        // This tag allows us to uniquely identify this as a React Element
        $$typeof: v,
        // Built-in properties that belong on the element
        type: e,
        key: r,
        ref: t,
        props: o,
        // Record the component responsible for creating this element.
        _owner: s
      };
      return a._store = {}, Object.defineProperty(a._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: !1
      }), Object.defineProperty(a, "_self", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: n
      }), Object.defineProperty(a, "_source", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: i
      }), Object.freeze && (Object.freeze(a.props), Object.freeze(a)), a;
    };
    function er(e, r, t, n, i) {
      {
        var s, o = {}, a = null, x = null;
        t !== void 0 && (ve(t), a = "" + t), Ge(r) && (ve(r.key), a = "" + r.key), ze(r) && (x = r.ref, Xe(r, i));
        for (s in r)
          A.call(r, s) && !Ke.hasOwnProperty(s) && (o[s] = r[s]);
        if (e && e.defaultProps) {
          var f = e.defaultProps;
          for (s in f)
            o[s] === void 0 && (o[s] = f[s]);
        }
        if (a || x) {
          var d = typeof e == "function" ? e.displayName || e.name || "Unknown" : e;
          a && He(o, d), x && Ze(o, d);
        }
        return Qe(e, a, x, i, n, pe.current, o);
      }
    }
    var z = k.ReactCurrentOwner, he = k.ReactDebugCurrentFrame;
    function F(e) {
      if (e) {
        var r = e._owner, t = M(e.type, e._source, r ? r.type : null);
        he.setExtraStackFrame(t);
      } else
        he.setExtraStackFrame(null);
    }
    var G;
    G = !1;
    function X(e) {
      return typeof e == "object" && e !== null && e.$$typeof === v;
    }
    function me() {
      {
        if (z.current) {
          var e = O(z.current.type);
          if (e)
            return `

Check the render method of \`` + e + "`.";
        }
        return "";
      }
    }
    function rr(e) {
      return "";
    }
    var xe = {};
    function tr(e) {
      {
        var r = me();
        if (!r) {
          var t = typeof e == "string" ? e : e.displayName || e.name;
          t && (r = `

Check the top-level render call using <` + t + ">.");
        }
        return r;
      }
    }
    function ye(e, r) {
      {
        if (!e._store || e._store.validated || e.key != null)
          return;
        e._store.validated = !0;
        var t = tr(r);
        if (xe[t])
          return;
        xe[t] = !0;
        var n = "";
        e && e._owner && e._owner !== z.current && (n = " It was passed a child from " + O(e._owner.type) + "."), F(e), m('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', t, n), F(null);
      }
    }
    function Ee(e, r) {
      {
        if (typeof e != "object")
          return;
        if (K(e))
          for (var t = 0; t < e.length; t++) {
            var n = e[t];
            X(n) && ye(n, r);
          }
        else if (X(e))
          e._store && (e._store.validated = !0);
        else if (e) {
          var i = Se(e);
          if (typeof i == "function" && i !== e.entries)
            for (var s = i.call(e), o; !(o = s.next()).done; )
              X(o.value) && ye(o.value, r);
        }
      }
    }
    function nr(e) {
      {
        var r = e.type;
        if (r == null || typeof r == "string")
          return;
        var t;
        if (typeof r == "function")
          t = r.propTypes;
        else if (typeof r == "object" && (r.$$typeof === b || // Note: Memo only checks outer props here.
        // Inner props are checked in the reconciler.
        r.$$typeof === T))
          t = r.propTypes;
        else
          return;
        if (t) {
          var n = O(r);
          Ue(t, e.props, "prop", n, e);
        } else if (r.PropTypes !== void 0 && !G) {
          G = !0;
          var i = O(r);
          m("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", i || "Unknown");
        }
        typeof r.getDefaultProps == "function" && !r.getDefaultProps.isReactClassApproved && m("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
      }
    }
    function ar(e) {
      {
        for (var r = Object.keys(e.props), t = 0; t < r.length; t++) {
          var n = r[t];
          if (n !== "children" && n !== "key") {
            F(e), m("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", n), F(null);
            break;
          }
        }
        e.ref !== null && (F(e), m("Invalid attribute `ref` supplied to `React.Fragment`."), F(null));
      }
    }
    var Re = {};
    function _e(e, r, t, n, i, s) {
      {
        var o = Ie(e);
        if (!o) {
          var a = "";
          (e === void 0 || typeof e == "object" && e !== null && Object.keys(e).length === 0) && (a += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.");
          var x = rr();
          x ? a += x : a += me();
          var f;
          e === null ? f = "null" : K(e) ? f = "array" : e !== void 0 && e.$$typeof === v ? (f = "<" + (O(e.type) || "Unknown") + " />", a = " Did you accidentally export a JSX literal instead of a component?") : f = typeof e, m("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", f, a);
        }
        var d = er(e, r, t, i, s);
        if (d == null)
          return d;
        if (o) {
          var _ = r.children;
          if (_ !== void 0)
            if (n)
              if (K(_)) {
                for (var D = 0; D < _.length; D++)
                  Ee(_[D], e);
                Object.freeze && Object.freeze(_);
              } else
                m("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
            else
              Ee(_, e);
        }
        if (A.call(r, "key")) {
          var P = O(e), E = Object.keys(r).filter(function(cr) {
            return cr !== "key";
          }), H = E.length > 0 ? "{key: someKey, " + E.join(": ..., ") + ": ...}" : "{key: someKey}";
          if (!Re[P + H]) {
            var ur = E.length > 0 ? "{" + E.join(": ..., ") + ": ...}" : "{}";
            m(`A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`, H, P, ur, P), Re[P + H] = !0;
          }
        }
        return e === c ? ar(d) : nr(d), d;
      }
    }
    function or(e, r, t) {
      return _e(e, r, t, !0);
    }
    function ir(e, r, t) {
      return _e(e, r, t, !1);
    }
    var sr = ir, lr = or;
    $.Fragment = c, $.jsx = sr, $.jsxs = lr;
  })()), $;
}
var Te;
function vr() {
  return Te || (Te = 1, process.env.NODE_ENV === "production" ? U.exports = fr() : U.exports = dr()), U.exports;
}
var l = vr();
const pr = {
  primary: "bg-brand-gradient text-white shadow-soft hover:shadow-glow hover:scale-[1.02] active:scale-[0.99]",
  secondary: "bg-white/70 backdrop-blur-sm border border-stroke text-content-primary shadow-soft hover:shadow-card hover:scale-[1.02] active:scale-[0.99]",
  ghost: "bg-transparent text-brand-lavender hover:text-brand-pink active:text-brand-orange"
}, br = {
  sm: "px-4 py-2 text-sm gap-1.5",
  md: "px-6 py-3 text-base gap-2",
  lg: "px-8 py-4 text-lg gap-2.5"
};
function mr({
  variant: u = "primary",
  size: v = "md",
  className: p = "",
  disabled: c = !1,
  children: g,
  ...h
}) {
  return /* @__PURE__ */ l.jsx(
    "button",
    {
      disabled: c,
      className: [
        "inline-flex items-center justify-center rounded-pill",
        "font-heading font-bold",
        "transition-all duration-300 ease-out",
        "cursor-pointer select-none",
        "focus:outline-none focus-visible:ring-2",
        "focus-visible:ring-brand-lavender focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "disabled:hover:scale-100 disabled:hover:shadow-soft",
        pr[u],
        br[v],
        p
      ].join(" "),
      ...h,
      children: g
    }
  );
}
function xr({
  children: u,
  className: v = "",
  withOrbs: p = !1,
  noPadding: c = !1,
  ...g
}) {
  return /* @__PURE__ */ l.jsxs(
    "div",
    {
      className: [
        "relative rounded-card overflow-hidden",
        "bg-white/70 backdrop-blur-[12px]",
        "border border-white/80",
        "shadow-card",
        !c && "p-6",
        v
      ].filter(Boolean).join(" "),
      ...g,
      children: [
        p && /* @__PURE__ */ l.jsxs(
          "div",
          {
            "aria-hidden": "true",
            className: "pointer-events-none absolute inset-0 overflow-hidden",
            children: [
              /* @__PURE__ */ l.jsx("div", { className: "absolute -top-10 -right-10 w-40 h-40 rounded-blob bg-gradient-to-br from-brand-lavender/25 to-brand-pink/15 blur-2xl animate-float" }),
              /* @__PURE__ */ l.jsx("div", { className: "absolute -bottom-10 -left-10 w-48 h-48 rounded-blob bg-gradient-to-br from-brand-yellow/20 to-brand-orange/15 blur-2xl animate-float-slow" })
            ]
          }
        ),
        /* @__PURE__ */ l.jsx("div", { className: "relative z-10", children: u })
      ]
    }
  );
}
const gr = {
  yellow: "bg-brand-yellow/20 text-amber-700",
  orange: "bg-brand-orange/20 text-orange-700",
  pink: "bg-brand-pink/20 text-rose-700",
  lavender: "bg-brand-lavender/20 text-purple-700",
  neutral: "bg-surface-warm text-content-secondary"
};
function yr({ variant: u = "lavender", className: v = "", children: p, ...c }) {
  return /* @__PURE__ */ l.jsx(
    "span",
    {
      className: [
        "inline-flex items-center px-3 py-1",
        "rounded-pill",
        "font-caption text-xs font-bold",
        "select-none whitespace-nowrap",
        gr[u],
        v
      ].join(" "),
      ...c,
      children: p
    }
  );
}
function Er({
  label: u,
  id: v,
  className: p = "",
  error: c,
  hint: g,
  ...h
}) {
  const y = v || (u ? u.toLowerCase().replace(/\s+/g, "-") : void 0);
  return /* @__PURE__ */ l.jsxs("div", { className: "flex flex-col gap-1.5", children: [
    u && /* @__PURE__ */ l.jsx(
      "label",
      {
        htmlFor: y,
        className: "font-heading text-sm font-bold text-content-secondary",
        children: u
      }
    ),
    /* @__PURE__ */ l.jsx(
      "input",
      {
        id: y,
        className: [
          "w-full rounded-xl bg-white",
          "border px-4 py-3",
          "font-body text-content-primary",
          "placeholder:text-content-muted",
          "transition-all duration-200 ease-out",
          "focus:outline-none",
          c ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-200" : "border-stroke focus:border-brand-lavender focus:ring-2 focus:ring-brand-lavender/20",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-warm",
          p
        ].join(" "),
        ...h
      }
    ),
    c && /* @__PURE__ */ l.jsx("p", { className: "font-caption text-xs text-red-500", children: c }),
    g && !c && /* @__PURE__ */ l.jsx("p", { className: "font-caption text-xs text-content-muted", children: g })
  ] });
}
function Rr({
  checked: u = !1,
  onChange: v,
  label: p,
  disabled: c = !1,
  id: g,
  ...h
}) {
  const y = g || (p ? `toggle-${p.toLowerCase().replace(/\s+/g, "-")}` : void 0);
  return /* @__PURE__ */ l.jsxs("div", { className: "inline-flex items-center gap-3", children: [
    /* @__PURE__ */ l.jsx(
      "button",
      {
        id: y,
        type: "button",
        role: "switch",
        "aria-checked": u,
        disabled: c,
        onClick: () => !c && (v == null ? void 0 : v(!u)),
        className: [
          "relative inline-flex h-7 w-12 flex-shrink-0 rounded-pill",
          "transition-all duration-300 ease-out",
          "focus:outline-none focus-visible:ring-2",
          "focus-visible:ring-brand-lavender focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          u ? "bg-brand-gradient shadow-glow" : "bg-gray-200"
        ].join(" "),
        ...h,
        children: /* @__PURE__ */ l.jsx(
          "span",
          {
            className: [
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft",
              "transition-all duration-300 ease-out",
              u ? "left-6" : "left-1"
            ].join(" "),
            "aria-hidden": "true"
          }
        )
      }
    ),
    p && /* @__PURE__ */ l.jsx(
      "label",
      {
        htmlFor: y,
        className: "font-body text-sm text-content-primary cursor-pointer select-none",
        children: p
      }
    )
  ] });
}
function _r({
  label: u,
  id: v,
  options: p = [],
  placeholder: c = "Seleccionar…",
  className: g = "",
  error: h,
  hint: y,
  ...j
}) {
  const b = v || (u ? u.toLowerCase().replace(/\s+/g, "-") : void 0);
  return /* @__PURE__ */ l.jsxs("div", { className: "flex flex-col gap-1.5", children: [
    u && /* @__PURE__ */ l.jsx(
      "label",
      {
        htmlFor: b,
        className: "font-heading text-sm font-bold text-content-secondary",
        children: u
      }
    ),
    /* @__PURE__ */ l.jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ l.jsxs(
        "select",
        {
          id: b,
          className: [
            "w-full appearance-none rounded-xl",
            "bg-white/70 backdrop-blur-sm",
            "border px-4 py-3 pr-10",
            "font-body text-content-primary",
            "shadow-soft",
            "transition-all duration-200 ease-out",
            "cursor-pointer",
            "focus:outline-none",
            h ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-200" : "border-stroke focus:border-brand-lavender focus:ring-2 focus:ring-brand-lavender/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            g
          ].join(" "),
          ...j,
          children: [
            c && /* @__PURE__ */ l.jsx("option", { value: "", disabled: !0, children: c }),
            p.map((w) => /* @__PURE__ */ l.jsx("option", { value: w.value, children: w.label }, w.value))
          ]
        }
      ),
      /* @__PURE__ */ l.jsx(
        "div",
        {
          "aria-hidden": "true",
          className: "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2",
          children: /* @__PURE__ */ l.jsx("svg", { width: "12", height: "8", viewBox: "0 0 12 8", fill: "none", children: /* @__PURE__ */ l.jsx(
            "path",
            {
              d: "M1 1L6 7L11 1",
              stroke: "#b48ae4",
              strokeWidth: "1.5",
              strokeLinecap: "round",
              strokeLinejoin: "round"
            }
          ) })
        }
      )
    ] }),
    h && /* @__PURE__ */ l.jsx("p", { className: "font-caption text-xs text-red-500", children: h }),
    y && !h && /* @__PURE__ */ l.jsx("p", { className: "font-caption text-xs text-content-muted", children: y })
  ] });
}
export {
  yr as Badge,
  mr as Button,
  xr as Card,
  Er as Input,
  _r as Select,
  Rr as Toggle
};
