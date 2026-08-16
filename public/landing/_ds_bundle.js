/* @ds-bundle: {"format":4,"namespace":"FundirDesignSystem_eef84d","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"CardHeader","sourcePath":"components/core/Card.jsx"},{"name":"CardSection","sourcePath":"components/core/Card.jsx"},{"name":"EmptyState","sourcePath":"components/core/EmptyState.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"StatusTag","sourcePath":"components/core/StatusTag.jsx"},{"name":"ConfidenceBar","sourcePath":"components/data/ConfidenceBar.jsx"},{"name":"EvidenceList","sourcePath":"components/data/EvidenceList.jsx"},{"name":"FigureHeading","sourcePath":"components/data/FigureHeading.jsx"},{"name":"KpiCard","sourcePath":"components/data/KpiCard.jsx"},{"name":"RiskFlagRow","sourcePath":"components/data/RiskFlagRow.jsx"},{"name":"ScoreBadge","sourcePath":"components/data/ScoreBadge.jsx"},{"name":"FilterBar","sourcePath":"components/grants/FilterBar.jsx"},{"name":"GrantCard","sourcePath":"components/grants/GrantCard.jsx"},{"name":"RecommendationGroup","sourcePath":"components/grants/RecommendationGroup.jsx"},{"name":"RecommendationPill","sourcePath":"components/grants/RecommendationPill.jsx"},{"name":"SidebarNav","sourcePath":"components/navigation/SidebarNav.jsx"},{"name":"TopBar","sourcePath":"components/navigation/TopBar.jsx"}],"sourceHashes":{"components/core/Button.jsx":"17d1e880f058","components/core/Card.jsx":"b98de9b994d0","components/core/EmptyState.jsx":"518afd5fdefc","components/core/Icon.jsx":"7f9b31e9a38f","components/core/StatusTag.jsx":"f3686147a5ee","components/data/ConfidenceBar.jsx":"b8047b0ff0fe","components/data/EvidenceList.jsx":"fe3a620443df","components/data/FigureHeading.jsx":"0206a54d9739","components/data/KpiCard.jsx":"8bd5e535cf4d","components/data/RiskFlagRow.jsx":"ee55a8fff145","components/data/ScoreBadge.jsx":"fa86213d2d5f","components/grants/FilterBar.jsx":"bf07749e767c","components/grants/GrantCard.jsx":"3ba6430b756d","components/grants/RecommendationGroup.jsx":"2953f225b281","components/grants/RecommendationPill.jsx":"c42caf428d8d","components/navigation/SidebarNav.jsx":"b5493c25a90b","components/navigation/TopBar.jsx":"f3a45076efa2","ui_kits/console/ConsoleShell.jsx":"6b2d86471c62","ui_kits/console/DashboardScreen.jsx":"623762f345f3","ui_kits/console/MatchesScreen.jsx":"4b4686ecec5a","ui_kits/console/PipelineScreen.jsx":"cee16f9d2ac3","ui_kits/console/data.js":"89dbf3284081","ui_kits/marketing/Sections.jsx":"1b0f803a3492"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.FundirDesignSystem_eef84d = window.FundirDesignSystem_eef84d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** <Button> — four variants, no surprises. Primary fills with --accent; one per surface. */
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  style,
  disabled,
  ...rest
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-body)',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background-color var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast)',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap'
  };
  const sizes = {
    sm: {
      height: 32,
      padding: '0 12px'
    },
    md: {
      height: 40,
      padding: '0 16px'
    }
  };
  const variants = {
    primary: {
      background: 'var(--accent)',
      color: 'var(--accent-on)',
      border: '1px solid var(--accent)'
    },
    secondary: {
      background: 'var(--bg-surface)',
      color: 'var(--text-primary)',
      border: '1px solid var(--border-hairline)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-primary)',
      border: '1px solid transparent'
    },
    link: {
      background: 'transparent',
      color: 'var(--accent)',
      border: 'none',
      padding: 0,
      height: 'auto'
    }
  };
  const [hover, setHover] = React.useState(false);
  const hoverStyle = !disabled && hover ? {
    primary: {
      background: 'var(--accent-hover)',
      borderColor: 'var(--accent-hover)'
    },
    secondary: {
      background: 'var(--bg-elevated)'
    },
    ghost: {
      textDecoration: 'underline'
    },
    link: {
      color: 'var(--accent-hover)',
      textDecoration: 'underline'
    }
  }[variant] : null;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...base,
      ...(variant === 'link' ? {} : sizes[size]),
      ...variants[variant],
      ...hoverStyle,
      ...style
    }
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** <Card> — the default container. Hairline border, no shadow. Elevation is a surface tint. */
function Card({
  nested,
  console: isConsole,
  padding,
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      background: 'var(--bg-surface)',
      border: nested ? 'none' : '1px solid var(--border-hairline)',
      borderRadius: isConsole ? 'var(--radius-console)' : 'var(--radius-sm)',
      padding: padding ?? (isConsole ? '18px 20px' : 'var(--card-pad)'),
      boxShadow: 'none',
      ...style
    }
  }, rest), children);
}

/** Eyebrow + title + right-aligned actions. */
function CardHeader({
  eyebrow,
  title,
  actions,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow != null && /*#__PURE__*/React.createElement("div", {
    className: "fd-eyebrow",
    style: {
      color: 'var(--text-secondary)',
      marginBottom: 4
    }
  }, eyebrow), /*#__PURE__*/React.createElement("div", {
    className: "fd-h2",
    style: {
      color: 'var(--text-primary)'
    }
  }, title)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, actions));
}

/** Hairline-divided section inside a Card. */
function CardSection({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      paddingTop: 16,
      borderTop: '1px solid var(--border-hairline)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card, CardHeader, CardSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/EmptyState.jsx
try { (() => {
/** <EmptyState> — shipped on every list, table and chart that can have no data. */
function EmptyState({
  icon,
  variant = 'no-data',
  title,
  body,
  cta,
  skeleton
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: variant === 'waiting' ? 'status' : undefined,
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: '48px 16px'
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--text-secondary)',
      marginBottom: 12
    }
  }, icon), /*#__PURE__*/React.createElement("div", {
    className: "fd-h2",
    style: {
      color: 'var(--text-primary)',
      marginBottom: 4
    }
  }, title), body && /*#__PURE__*/React.createElement("div", {
    className: "fd-body",
    style: {
      color: 'var(--text-muted)',
      maxWidth: 420,
      marginBottom: 16
    }
  }, body), cta, skeleton && variant === 'waiting' && /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 420,
      marginTop: 24,
      display: 'grid',
      gap: 8
    }
  }, [0, 1, 2].map(i => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: 12,
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elevated)'
    }
  }))));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
/**
 * <Icon> — thin wrapper over Lucide (the product's only icon set).
 * Renders a lucide glyph from the CDN sprite set at one stroke weight.
 */
function Icon({
  name,
  size = 14,
  color = 'currentColor',
  strokeWidth = 2,
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const draw = () => {
      const lucide = typeof window !== 'undefined' ? window.lucide : null;
      if (!lucide || !ref.current) return;
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      lucide.createIcons({
        nameAttr: 'data-lucide',
        attrs: {
          width: size,
          height: size,
          stroke: color,
          'stroke-width': strokeWidth
        },
        root: ref.current
      });
    };
    draw();
    const t = setTimeout(draw, 300);
    return () => clearTimeout(t);
  }, [name, size, color, strokeWidth]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    "aria-hidden": true,
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      flexShrink: 0,
      ...style
    }
  });
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusTag.jsx
try { (() => {
const TONE = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  critical: 'var(--critical)',
  info: 'var(--info)',
  neutral: 'var(--text-tertiary)'
};

/** <StatusTag> — quiet uppercase status. Text-only by default; tinted fill only when a chip is truly needed. */
function StatusTag({
  tone = 'neutral',
  filled,
  children,
  style
}) {
  const color = TONE[tone] ?? TONE.neutral;
  const tint = {
    accent: 'var(--accent-tint)',
    success: 'var(--success-tint)',
    warning: 'var(--warning-tint)',
    critical: 'var(--critical-tint)',
    info: 'var(--info-tint)',
    neutral: 'var(--bg-elevated)'
  }[tone];
  return /*#__PURE__*/React.createElement("span", {
    className: "fd-eyebrow",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      color,
      letterSpacing: '0.1em',
      ...(filled ? {
        background: tint,
        borderRadius: 5,
        padding: '3px 7px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 700
      } : {}),
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { StatusTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusTag.jsx", error: String((e && e.message) || e) }); }

// components/data/ConfidenceBar.jsx
try { (() => {
/** <ConfidenceBar> — mono number + 4px track. Any 0–100 signal. */
function ConfidenceBar({
  value,
  label,
  width = 120,
  style
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      flex: 'none',
      textAlign: 'right',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      fontSize: 9,
      letterSpacing: '0.11em',
      textTransform: 'uppercase',
      color: 'var(--text-tertiary)',
      marginBottom: 4
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      fontWeight: 700,
      fontSize: 17,
      color: 'var(--text-primary)'
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      background: 'var(--bg-elevated)',
      borderRadius: 3,
      marginTop: 8,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${v}%`,
      background: 'var(--accent)',
      borderRadius: 3,
      transition: 'width var(--duration-slow) var(--ease-console)'
    }
  })));
}
Object.assign(__ds_scope, { ConfidenceBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ConfidenceBar.jsx", error: String((e && e.message) || e) }); }

// components/data/EvidenceList.jsx
try { (() => {
const FACTOR_DOT = {
  semantic: 'var(--accent)',
  eligibility: 'var(--success)',
  financial_990: 'var(--text-muted)',
  funder_affinity: 'var(--warning)',
  strategic: 'var(--text-secondary)',
  historical: 'var(--accent)'
};
const FACTOR_LABEL = {
  semantic: 'semantic',
  eligibility: 'eligibility',
  financial_990: '990 fit',
  funder_affinity: 'funder',
  strategic: 'strategic',
  historical: 'historical'
};

/** <EvidenceList> — per-factor evidence bullets. The signature surface. */
function EvidenceList({
  items = [],
  collapseAfter = 6
}) {
  const [expanded, setExpanded] = React.useState(false);
  if (!items.length) return null;
  const shown = expanded ? items : items.slice(0, collapseAfter);
  const remaining = items.length - shown.length;
  return /*#__PURE__*/React.createElement("ul", {
    style: {
      display: 'grid',
      gap: 8,
      margin: 0,
      padding: 0,
      listStyle: 'none'
    }
  }, shown.map((item, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      marginTop: 7,
      width: 6,
      height: 6,
      borderRadius: 'var(--radius-pill)',
      flexShrink: 0,
      background: FACTOR_DOT[item.factor] ?? 'var(--text-tertiary)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "fd-body",
    style: {
      color: 'var(--text-primary)',
      flex: 1,
      minWidth: 0
    }
  }, item.text), /*#__PURE__*/React.createElement("span", {
    className: "fd-eyebrow",
    style: {
      color: 'var(--text-tertiary)',
      flexShrink: 0,
      paddingTop: 2
    }
  }, FACTOR_LABEL[item.factor] ?? item.factor))), remaining > 0 && !expanded && /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setExpanded(true),
    className: "fd-caption",
    style: {
      background: 'none',
      border: 'none',
      padding: 0,
      color: 'var(--accent)',
      textDecoration: 'underline',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, "Show all evidence (", remaining, " more)")));
}
Object.assign(__ds_scope, { EvidenceList });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/EvidenceList.jsx", error: String((e && e.message) || e) }); }

// components/data/FigureHeading.jsx
try { (() => {
/** <FigureHeading> — "FIG. 01 · Title · meta". The dashboard's section marker. */
function FigureHeading({
  figure,
  title,
  meta,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 14,
      margin: '26px 0 13px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      fontSize: 10,
      letterSpacing: '0.14em',
      color: 'var(--accent)',
      fontWeight: 700,
      border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
      borderRadius: 5,
      padding: '3px 8px',
      background: 'var(--accent-tint)',
      whiteSpace: 'nowrap'
    }
  }, figure), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 17.5,
      fontWeight: 700,
      margin: 0,
      color: 'var(--text-primary)'
    }
  }, title), meta && /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      marginLeft: 'auto',
      fontSize: 10.5,
      color: 'var(--text-tertiary)',
      textAlign: 'right'
    }
  }, meta));
}
Object.assign(__ds_scope, { FigureHeading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/FigureHeading.jsx", error: String((e && e.message) || e) }); }

// components/data/KpiCard.jsx
try { (() => {
/** <KpiCard> — eyebrow label, mono value, caption. Optional 3px semantic left border. */
function KpiCard({
  label,
  value,
  caption,
  tone,
  spark,
  style
}) {
  const toneColor = {
    success: 'var(--success)',
    warning: 'var(--warning)',
    critical: 'var(--critical)',
    info: 'var(--info)'
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-hairline)',
      borderRadius: 'var(--radius-kpi)',
      padding: '13px 15px',
      position: 'relative',
      borderLeft: toneColor ? `3px solid ${toneColor}` : undefined,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      fontSize: 9,
      letterSpacing: '0.11em',
      textTransform: 'uppercase',
      color: 'var(--text-tertiary)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, label, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 'var(--radius-pill)',
      background: toneColor ?? 'var(--accent-bright)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      fontWeight: 700,
      fontSize: 23,
      letterSpacing: '-0.02em',
      marginTop: 6,
      color: toneColor ?? 'var(--text-primary)'
    }
  }, value), caption && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--text-secondary)',
      marginTop: 3
    }
  }, caption), spark && /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 64 24",
    "aria-hidden": true,
    style: {
      position: 'absolute',
      right: 12,
      bottom: 11,
      width: 60,
      height: 22
    }
  }, /*#__PURE__*/React.createElement("polyline", {
    points: spark,
    style: {
      fill: 'none',
      stroke: toneColor ?? 'var(--accent-bright)',
      strokeWidth: 2,
      strokeLinecap: 'round'
    }
  })));
}
Object.assign(__ds_scope, { KpiCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/KpiCard.jsx", error: String((e && e.message) || e) }); }

// components/data/RiskFlagRow.jsx
try { (() => {
const TONE = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  critical: 'var(--critical)',
  info: 'var(--info)'
};

/** <RiskFlagRow> — 3px semantic left border + uppercase tag. Any severity-bearing row. */
function RiskFlagRow({
  tone = 'warning',
  tag,
  title,
  body,
  style
}) {
  const color = TONE[tone] ?? TONE.warning;
  return /*#__PURE__*/React.createElement("li", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      paddingLeft: 12,
      borderLeft: `var(--border-semantic) solid ${color}`,
      listStyle: 'none',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fd-eyebrow",
    style: {
      color,
      flexShrink: 0,
      paddingTop: 2
    }
  }, tag), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "fd-body-strong",
    style: {
      color: 'var(--text-primary)'
    }
  }, title), body && /*#__PURE__*/React.createElement("div", {
    className: "fd-caption",
    style: {
      color: 'var(--text-secondary)'
    }
  }, body)));
}
Object.assign(__ds_scope, { RiskFlagRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/RiskFlagRow.jsx", error: String((e && e.message) || e) }); }

// components/data/ScoreBadge.jsx
try { (() => {
const VARIANT = {
  pursue: {
    bg: 'var(--success-tint)',
    fg: 'var(--success)'
  },
  maybe: {
    bg: 'var(--warning-tint)',
    fg: 'var(--warning)'
  },
  skip: {
    bg: 'var(--critical-tint)',
    fg: 'var(--critical)'
  }
};
const SIZE = {
  sm: {
    w: 28,
    h: 28,
    fs: 13
  },
  lg: {
    w: 40,
    h: 40,
    fs: 18
  }
};
function variantFor(score) {
  return score >= 70 ? 'pursue' : score >= 50 ? 'maybe' : 'skip';
}

/** <ScoreBadge> — composite 0–100 score. Never shows decimals. */
function ScoreBadge({
  score,
  variant,
  size = 'sm',
  caption,
  style
}) {
  const v = variant ?? variantFor(score);
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const s = SIZE[size];
  const badge = /*#__PURE__*/React.createElement("div", {
    "aria-label": `Match score ${rounded} out of 100, recommendation ${v}`,
    className: "fd-mono",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: s.w,
      height: s.h,
      fontSize: s.fs,
      borderRadius: 'var(--radius-sm)',
      fontWeight: rounded < 70 ? 500 : 600,
      background: VARIANT[v].bg,
      color: VARIANT[v].fg,
      ...style
    }
  }, rounded);
  if (!caption) return badge;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4
    }
  }, badge, /*#__PURE__*/React.createElement("span", {
    className: "fd-caption",
    style: {
      color: 'var(--text-secondary)',
      maxWidth: 88,
      textAlign: 'center',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, caption));
}
Object.assign(__ds_scope, { ScoreBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ScoreBadge.jsx", error: String((e && e.message) || e) }); }

// components/grants/FilterBar.jsx
try { (() => {
/** <FilterBar> — chip row, one chip per dimension. Not a facet sidebar. */
function FilterBar({
  chips = [],
  onClearAll
}) {
  const activeCount = chips.filter(c => c.value != null).length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8
    }
  }, chips.map(c => {
    const active = c.value != null;
    return /*#__PURE__*/React.createElement("button", {
      key: c.key,
      type: "button",
      onClick: c.onClick,
      className: "fd-body",
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        height: 32,
        padding: '0 12px',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        transition: 'background-color var(--motion-fast), color var(--motion-fast)',
        background: active ? 'var(--accent)' : 'var(--bg-surface)',
        color: active ? 'var(--accent-on)' : 'var(--text-primary)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-hairline)'}`
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: active ? 'var(--accent-on)' : 'var(--text-muted)'
      }
    }, c.label), active && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
      "aria-hidden": true,
      style: {
        margin: '0 6px',
        opacity: 0.6
      }
    }, "\xB7"), /*#__PURE__*/React.createElement("span", null, c.value)));
  }), activeCount >= 2 && onClearAll && /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onClearAll,
    className: "fd-caption",
    style: {
      marginLeft: 4,
      background: 'none',
      border: 'none',
      color: 'var(--text-secondary)',
      textDecoration: 'underline',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, "Clear all"));
}
Object.assign(__ds_scope, { FilterBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/grants/FilterBar.jsx", error: String((e && e.message) || e) }); }

// components/grants/RecommendationGroup.jsx
try { (() => {
const DOT = {
  pursue: 'var(--success)',
  maybe: 'var(--warning)',
  skip: 'var(--critical)'
};
function SectionHeading({
  variant,
  label,
  count
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      width: 6,
      height: 6,
      borderRadius: 'var(--radius-pill)',
      background: DOT[variant]
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "fd-eyebrow",
    style: {
      color: 'var(--text-primary)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "fd-mono fd-caption",
    style: {
      color: 'var(--text-secondary)'
    }
  }, count));
}

/** <RecommendationGroup> — Pursue / Maybe / Skip. Skip collapses by default; saying no is a feature. */
function RecommendationGroup({
  pursue,
  maybe,
  skip
}) {
  const [skipOpen, setSkipOpen] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 24
    }
  }, pursue?.count > 0 && /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(SectionHeading, {
    variant: "pursue",
    label: "Pursue",
    count: pursue.count
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'grid',
      gap: 8
    }
  }, pursue.children)), maybe?.count > 0 && /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement(SectionHeading, {
    variant: "maybe",
    label: "Maybe",
    count: maybe.count
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'grid',
      gap: 8
    }
  }, maybe.children)), skip?.count > 0 && /*#__PURE__*/React.createElement("section", null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setSkipOpen(v => !v),
    "aria-expanded": skipOpen,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(SectionHeading, {
    variant: "skip",
    label: "Skip",
    count: skip.count
  }), /*#__PURE__*/React.createElement("span", {
    className: "fd-mono fd-caption",
    style: {
      color: 'var(--text-tertiary)'
    }
  }, skipOpen ? '−' : '+')), skipOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'grid',
      gap: 8
    }
  }, skip.children)));
}
Object.assign(__ds_scope, { RecommendationGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/grants/RecommendationGroup.jsx", error: String((e && e.message) || e) }); }

// components/grants/RecommendationPill.jsx
try { (() => {
const VARIANT = {
  pursue: {
    bg: 'var(--success-tint)',
    fg: 'var(--success)'
  },
  maybe: {
    bg: 'var(--warning-tint)',
    fg: 'var(--warning)'
  },
  skip: {
    bg: 'var(--critical-tint)',
    fg: 'var(--critical)'
  }
};
const LABEL = {
  pursue: 'Pursue',
  maybe: 'Maybe',
  skip: 'Skip'
};

/** <RecommendationPill> — the win-triage primitive. */
function RecommendationPill({
  recommendation = 'pursue',
  reason,
  label,
  style
}) {
  const v = VARIANT[recommendation] ?? VARIANT.pursue;
  return /*#__PURE__*/React.createElement("span", {
    title: reason,
    className: "fd-eyebrow",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 24,
      padding: '0 10px',
      borderRadius: 'var(--radius-sm)',
      letterSpacing: '0.1em',
      background: v.bg,
      color: v.fg,
      ...style
    }
  }, label ?? LABEL[recommendation]);
}
Object.assign(__ds_scope, { RecommendationPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/grants/RecommendationPill.jsx", error: String((e && e.message) || e) }); }

// components/grants/GrantCard.jsx
try { (() => {
function formatDeadline(days, date) {
  if (days == null && !date) return 'Rolling';
  if (days != null && days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days != null && days <= 14) return `${days} days left`;
  if (days != null) return `${days} days`;
  return date ?? '';
}

/** <GrantCard> — atomic unit of the discover and triage surfaces. Whole card links to detail. */
function GrantCard({
  href = '#',
  title,
  funder,
  eyebrow,
  score,
  recommendation = 'pursue',
  matchedProgram,
  evidence = [],
  deadlineDays,
  deadlineDate,
  reason,
  rationale,
  style
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("a", {
    href: href,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: 'block',
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-sm)',
      padding: 'var(--card-pad)',
      textDecoration: 'none',
      border: `1px solid ${hover ? 'color-mix(in srgb, var(--accent) 40%, var(--border-hairline))' : 'var(--border-hairline)'}`,
      transition: 'border-color var(--motion-fast)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fd-eyebrow",
    style: {
      color: 'var(--text-secondary)',
      letterSpacing: '0.1em'
    }
  }, eyebrow), /*#__PURE__*/React.createElement(__ds_scope.RecommendationPill, {
    recommendation: recommendation,
    reason: reason
  })), /*#__PURE__*/React.createElement("div", {
    className: "fd-h2",
    style: {
      color: 'var(--text-primary)',
      lineHeight: 1.35
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "fd-caption",
    style: {
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, funder), rationale && /*#__PURE__*/React.createElement("p", {
    className: "fd-body",
    style: {
      marginTop: 8,
      marginBottom: 0,
      color: 'var(--text-muted)',
      lineHeight: 1.4
    }
  }, rationale), evidence.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.EvidenceList, {
    items: evidence,
    collapseAfter: 3
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16,
      paddingTop: 12,
      borderTop: '1px solid var(--border-hairline)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fd-caption",
    style: {
      color: 'var(--text-muted)'
    }
  }, formatDeadline(deadlineDays, deadlineDate)), /*#__PURE__*/React.createElement(__ds_scope.ScoreBadge, {
    score: score,
    variant: recommendation,
    size: "lg",
    caption: matchedProgram
  })));
}
Object.assign(__ds_scope, { GrantCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/grants/GrantCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNav.jsx
try { (() => {
/**
 * <SidebarNav> — 224px app sidebar: Fundir mark, org lockup, nav, utility footer.
 * Active item = accent text + 2px left bar. Never a filled pill.
 */
function SidebarNav({
  items = [],
  footerItems = [],
  active,
  onNavigate,
  orgName = 'My Organization',
  orgLogo,
  userEmail,
  style
}) {
  const initials = orgName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const row = (item, isActive) => /*#__PURE__*/React.createElement("button", {
    key: item.href,
    type: "button",
    onClick: () => onNavigate && onNavigate(item.href),
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      padding: '7px 8px 7px 12px',
      marginBottom: 2,
      fontSize: 13,
      textAlign: 'left',
      fontFamily: 'var(--font-sans)',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      borderRadius: 'var(--radius-sm)',
      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
      fontWeight: isActive ? 500 : 400,
      transition: 'color var(--motion-fast), background-color var(--motion-fast)'
    },
    onMouseEnter: e => {
      if (!isActive) {
        e.currentTarget.style.background = 'var(--bg-elevated)';
        e.currentTarget.style.color = 'var(--text-primary)';
      }
    },
    onMouseLeave: e => {
      if (!isActive) {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = 'var(--text-secondary)';
      }
    }
  }, isActive && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 2,
      top: 6,
      bottom: 6,
      width: 'var(--border-nav-active)',
      borderRadius: 1,
      background: 'var(--accent)'
    }
  }), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: item.icon,
    size: 16,
    color: isActive ? 'var(--accent)' : 'var(--text-tertiary)'
  }), item.label);
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 'var(--sidebar-w)',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border-hairline)',
      background: 'var(--bg-surface)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px 12px',
      borderBottom: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/fundir-mark.png",
    alt: "Fundir",
    style: {
      width: 28,
      height: 28,
      objectFit: 'contain',
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "fd-h3",
    style: {
      color: 'var(--text-primary)',
      letterSpacing: '-0.01em'
    }
  }, "Fundir")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 8px'
    },
    title: orgName
  }, orgLogo ? /*#__PURE__*/React.createElement("img", {
    src: orgLogo,
    alt: orgName,
    style: {
      width: 24,
      height: 24,
      borderRadius: 'var(--radius-sm)',
      objectFit: 'contain',
      flexShrink: 0
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-elevated)',
      color: 'var(--text-secondary)',
      fontSize: 10,
      fontWeight: 600,
      flexShrink: 0
    }
  }, initials), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--text-secondary)',
      lineHeight: 1.25
    }
  }, orgName))), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      padding: '12px',
      overflowY: 'auto'
    }
  }, items.map(i => row(i, active === i.href)), footerItems.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 12,
      marginTop: 12,
      borderTop: '1px solid var(--border-hairline)'
    }
  }, footerItems.map(i => row(i, active === i.href)))), userEmail && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px',
      borderTop: '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "fd-eyebrow",
    style: {
      margin: 0,
      padding: '4px 12px',
      color: 'var(--text-tertiary)',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, userEmail)));
}
Object.assign(__ds_scope, { SidebarNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
/** <TopBar> — 48px quiet header with the command-palette trigger and user avatar. */
function TopBar({
  placeholder = 'Search grants, funders, commands…',
  shortcut = '⌘K',
  userEmail,
  onOpenPalette,
  right,
  style
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 40,
      height: 'var(--topbar-h)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '0 24px',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-hairline)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: onOpenPalette,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      height: 30,
      flex: 1,
      maxWidth: 420,
      padding: '0 10px',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border-hairline)',
      background: 'var(--bg-page)',
      color: 'var(--text-tertiary)',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      fontSize: 12.5
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 14,
    color: "var(--text-tertiary)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      textAlign: 'left'
    }
  }, placeholder), /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      fontSize: 10,
      color: 'var(--text-tertiary)',
      border: '1px solid var(--border-hairline)',
      borderRadius: 4,
      padding: '1px 5px'
    }
  }, shortcut)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, right, /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      width: 28,
      height: 28,
      borderRadius: 'var(--radius-pill)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--accent)',
      color: 'var(--accent-on)',
      fontSize: 11,
      fontWeight: 600
    },
    title: userEmail
  }, userEmail ? userEmail[0].toUpperCase() : 'U')));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/ConsoleShell.jsx
try { (() => {
const {
  SidebarNav,
  TopBar
} = window.FundirDesignSystem_eef84d;
const NAV = [{
  href: '/dashboard',
  label: 'Dashboard',
  icon: 'layout-dashboard'
}, {
  href: '/data',
  label: 'Data Hub',
  icon: 'database'
}, {
  href: '/discover',
  label: 'Matches',
  icon: 'search'
}, {
  href: '/pipeline',
  label: 'Tracker',
  icon: 'kanban-square'
}, {
  href: '/calendar',
  label: 'Calendar',
  icon: 'calendar-days'
}, {
  href: '/reports',
  label: 'Reports',
  icon: 'trending-up'
}, {
  href: '/financials',
  label: 'Financials',
  icon: 'bar-chart-3'
}, {
  href: '/foundations',
  label: 'Foundations',
  icon: 'landmark'
}];
const FOOTER_NAV = [{
  href: '/org',
  label: 'Org Profile',
  icon: 'building-2'
}, {
  href: '/settings',
  label: 'Settings',
  icon: 'settings'
}];
function ConsoleShell({
  route,
  onNavigate,
  children
}) {
  const org = window.FUNDIR_DATA.org;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-page)'
    }
  }, /*#__PURE__*/React.createElement(SidebarNav, {
    items: NAV,
    footerItems: FOOTER_NAV,
    active: route,
    onNavigate: onNavigate,
    orgName: org.name,
    orgLogo: org.logo,
    userEmail: org.email,
    style: {
      position: 'sticky',
      top: 0,
      height: '100vh'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    userEmail: org.email
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      background: 'var(--bg-page)'
    }
  }, children)));
}
Object.assign(window, {
  ConsoleShell,
  NAV,
  FOOTER_NAV
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/ConsoleShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/DashboardScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  KpiCard,
  Card,
  Button,
  Icon,
  FigureHeading,
  ConfidenceBar,
  StatusTag,
  RiskFlagRow
} = window.FundirDesignSystem_eef84d;
function CountUp({
  target,
  pre = '',
  suf = ''
}) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let raf,
      start = null;
    const step = ts => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / 1000, 1);
      setN(Math.round(p * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return /*#__PURE__*/React.createElement(React.Fragment, null, pre, n.toLocaleString(), suf);
}
function ProvenanceStrip({
  ein,
  sources,
  synced
}) {
  const item = {
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)'
  };
  const b = {
    color: 'var(--text-secondary)',
    fontWeight: 600
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 16,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...item,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--accent-bright)',
      display: 'block'
    }
  }), /*#__PURE__*/React.createElement("b", {
    style: b
  }, "Live")), /*#__PURE__*/React.createElement("span", {
    style: item
  }, "EIN ", /*#__PURE__*/React.createElement("b", {
    style: b
  }, ein)), /*#__PURE__*/React.createElement("span", {
    style: item
  }, "Sources ", /*#__PURE__*/React.createElement("b", {
    style: b
  }, sources)), /*#__PURE__*/React.createElement("span", {
    style: item
  }, "Synced ", /*#__PURE__*/React.createElement("b", {
    style: b
  }, synced)));
}
function TenantLockup({
  logo,
  name
}) {
  const short = name.split(/\s+/).slice(0, 3).map(w => w[0]).join('').toUpperCase();
  const badge = {
    width: 46,
    height: 46,
    borderRadius: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-hairline)'
  };
  const img = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    padding: 6,
    boxSizing: 'border-box'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: badge
  }, /*#__PURE__*/React.createElement("img", {
    src: logo,
    alt: name,
    style: img
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 96,
      height: 20,
      margin: '0 9px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 4,
      right: 4,
      top: 9,
      borderTop: '2px dotted var(--border-strong)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "dh-pulse",
    style: {
      position: 'absolute',
      top: 6,
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--accent-bright)',
      boxShadow: '0 0 8px rgba(21,145,122,.55)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: badge
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/fundir-mark.png",
    alt: "Fundir",
    style: img
  }))), /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      fontSize: 8.5,
      letterSpacing: '0.18em',
      color: 'var(--text-tertiary)'
    }
  }, short, " \xD7 FUNDIR \xB7 PRIVATE TENANT"));
}
function DashboardHero({
  data,
  onNavigate
}) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % data.ticker.length), 4200);
    return () => clearInterval(id);
  }, [data.ticker.length]);
  const today = 'Tuesday, August 11';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-hairline)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      padding: '16px 22px 22px'
    }
  }, /*#__PURE__*/React.createElement(ProvenanceStrip, {
    ein: data.org.ein,
    sources: data.provenance.sources,
    synced: data.provenance.synced
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 26,
      marginTop: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      fontSize: 10.5,
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      color: 'var(--text-tertiary)'
    }
  }, today), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 27,
      fontWeight: 800,
      letterSpacing: '-0.022em',
      margin: '7px 0 0',
      color: 'var(--text-primary)',
      lineHeight: 1.05
    }
  }, data.org.name), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 11,
      height: 20,
      position: 'relative',
      overflow: 'hidden',
      minWidth: 280,
      maxWidth: 560
    }
  }, data.ticker.map((m, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "fd-mono",
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      fontSize: 11.5,
      color: 'var(--accent)',
      whiteSpace: 'nowrap',
      opacity: i === tick ? 1 : 0,
      transition: 'opacity .5s'
    }
  }, m))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 14,
      color: "var(--accent-on)"
    }),
    onClick: () => onNavigate('/discover')
  }, "Run discovery"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => onNavigate('/pipeline')
  }, "Open pipeline"))), /*#__PURE__*/React.createElement(TenantLockup, {
    logo: data.org.logo,
    name: data.org.name
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 12,
      marginTop: 22
    }
  }, data.kpis.map(k => /*#__PURE__*/React.createElement(KpiCard, {
    key: k.label,
    label: k.label,
    tone: k.tone,
    caption: k.caption,
    spark: k.spark,
    value: /*#__PURE__*/React.createElement(CountUp, {
      target: k.value,
      pre: k.pre,
      suf: k.suf
    })
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 2,
      background: 'linear-gradient(90deg,var(--accent),var(--accent-bright))'
    }
  }));
}
function BankRow({
  row,
  last
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      padding: last ? '15px 0 2px' : '15px 0',
      borderBottom: last ? 'none' : '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      flexWrap: 'wrap'
    }
  }, row.name, /*#__PURE__*/React.createElement(StatusTag, {
    tone: row.relationship === 'existing' ? 'accent' : 'info',
    filled: true
  }, row.relationship), /*#__PURE__*/React.createElement(StatusTag, {
    tone: row.action === 'monitor' ? 'warning' : 'accent',
    filled: true
  }, row.action), row.einPending && /*#__PURE__*/React.createElement(StatusTag, {
    tone: "warning",
    filled: true
  }, "EIN pending")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-secondary)',
      marginTop: 5,
      lineHeight: 1.5
    }
  }, row.rationale), (row.chips.length > 0 || row.more > 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      flexWrap: 'wrap',
      marginTop: 8
    }
  }, row.chips.map(c => /*#__PURE__*/React.createElement("span", {
    key: c.name,
    className: "fd-mono",
    style: {
      fontSize: 10.5,
      border: '1px solid var(--border-hairline)',
      borderRadius: 6,
      padding: '4px 8px',
      color: 'var(--text-secondary)',
      background: 'var(--bg-elevated)'
    }
  }, c.name, " ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-primary)'
    }
  }, c.amount))), row.more > 0 && /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      fontSize: 10.5,
      border: '1px solid var(--border-hairline)',
      borderRadius: 6,
      padding: '4px 8px',
      color: 'var(--text-secondary)',
      background: 'var(--bg-elevated)'
    }
  }, "+", row.more, " more"))), /*#__PURE__*/React.createElement(ConfidenceBar, {
    value: row.confidence
  }));
}
function DashboardScreen({
  onNavigate
}) {
  const data = window.FUNDIR_DATA;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 32px',
      maxWidth: 1280,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(DashboardHero, {
    data: data,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement(FigureHeading, {
    figure: "FIG. 01",
    title: "CRA Bank Intelligence",
    meta: data.cra.meta
  }), /*#__PURE__*/React.createElement(Card, {
    console: true
  }, data.cra.rows.map((r, i) => /*#__PURE__*/React.createElement(BankRow, {
    key: r.name,
    row: r,
    last: i === data.cra.rows.length - 1
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.2fr 1fr',
      gap: 16,
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(FigureHeading, {
    figure: "FIG. 02",
    title: "Urgent deadlines",
    meta: `${data.deadlines.length} within 14 days`
  }), /*#__PURE__*/React.createElement(Card, {
    console: true
  }, data.deadlines.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: d.title,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '11px 0',
      borderBottom: i === data.deadlines.length - 1 ? 'none' : '1px solid var(--border-hairline)',
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      fontSize: 10,
      fontWeight: 700,
      borderRadius: 6,
      padding: '4px 8px',
      flex: 'none',
      background: d.days <= 1 ? 'var(--critical-tint)' : d.days <= 7 ? 'var(--warning-tint)' : 'var(--bg-elevated)',
      color: d.days <= 1 ? 'var(--critical)' : d.days <= 7 ? 'var(--warning)' : 'var(--text-tertiary)'
    }
  }, d.days, "d"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      color: 'var(--text-primary)'
    }
  }, d.title), /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      fontSize: 10.5,
      color: 'var(--text-tertiary)',
      flex: 'none'
    }
  }, d.agency)))), /*#__PURE__*/React.createElement(FigureHeading, {
    figure: "FIG. 04",
    title: "Concentration flags",
    meta: "990 FY2024 \xB7 reverse-screened"
  }), /*#__PURE__*/React.createElement(Card, {
    console: true
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      display: 'grid',
      gap: 14,
      margin: 0,
      padding: 0
    }
  }, data.flags.map(fl => /*#__PURE__*/React.createElement(RiskFlagRow, _extends({
    key: fl.title
  }, fl)))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(FigureHeading, {
    figure: "FIG. 03",
    title: "Funder prospects",
    meta: "ranked by peer-anchored fit"
  }), /*#__PURE__*/React.createElement(Card, {
    console: true
  }, data.funders.map((fu, i) => /*#__PURE__*/React.createElement("div", {
    key: fu.name,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      padding: '11px 0',
      borderBottom: i === data.funders.length - 1 ? 'none' : '1px solid var(--border-hairline)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      fontWeight: 700,
      fontSize: 13,
      width: 36,
      height: 36,
      flex: 'none',
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--accent-tint)',
      color: 'var(--accent)',
      border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)'
    }
  }, fu.score), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--text-primary)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, fu.name), /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      fontSize: 10.5,
      color: 'var(--text-tertiary)',
      flex: 'none'
    }
  }, fu.peers, " peers \xB7 ", fu.amount)))))));
}
Object.assign(window, {
  DashboardScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/MatchesScreen.jsx
try { (() => {
const {
  Card,
  Button,
  Icon,
  FilterBar,
  GrantCard,
  RecommendationGroup,
  EmptyState
} = window.FundirDesignSystem_eef84d;
function MatchesScreen() {
  const data = window.FUNDIR_DATA;
  const [chips, setChips] = React.useState({
    amount: null,
    deadline: null,
    source: null,
    funder: null,
    state: null
  });
  const [query, setQuery] = React.useState('');
  const toggle = (k, v) => setChips(c => ({
    ...c,
    [k]: c[k] ? null : v
  }));
  const chipList = [{
    key: 'amount',
    label: 'Amount',
    value: chips.amount,
    onClick: () => toggle('amount', '< $250K')
  }, {
    key: 'deadline',
    label: 'Deadline',
    value: chips.deadline,
    onClick: () => toggle('deadline', '≤ 30 days')
  }, {
    key: 'source',
    label: 'Source',
    value: chips.source,
    onClick: () => toggle('source', 'Federal')
  }, {
    key: 'funder',
    label: 'Funder type',
    value: chips.funder,
    onClick: () => toggle('funder', 'Foundation')
  }, {
    key: 'state',
    label: 'State',
    value: chips.state,
    onClick: () => toggle('state', 'IL')
  }];
  let matches = data.matches;
  if (chips.source === 'Federal') matches = matches.filter(m => m.eyebrow.includes('FEDERAL'));
  if (chips.deadline) matches = matches.filter(m => m.deadlineDays != null && m.deadlineDays <= 30);
  if (query) matches = matches.filter(m => (m.title + m.funder).toLowerCase().includes(query.toLowerCase()));
  const byRec = r => matches.filter(m => m.recommendation === r);
  const cards = list => list.map(m => /*#__PURE__*/React.createElement(GrantCard, {
    key: m.id,
    eyebrow: m.eyebrow,
    title: m.title,
    funder: m.funder,
    score: m.score,
    recommendation: m.recommendation,
    matchedProgram: m.matchedProgram,
    deadlineDays: m.deadlineDays,
    rationale: m.rationale,
    evidence: m.evidence || []
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 32px',
      maxWidth: 1280,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16,
    color: "var(--accent)"
  }), /*#__PURE__*/React.createElement("h1", {
    className: "fd-h1",
    style: {
      margin: 0,
      color: 'var(--text-primary)'
    }
  }, "Grant discovery")), /*#__PURE__*/React.createElement("p", {
    className: "fd-caption",
    style: {
      margin: '4px 0 0',
      color: 'var(--text-secondary)'
    }
  }, "Search the corpus in plain English, or run a fresh sweep against grants.gov")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "landmark",
      size: 14,
      color: "var(--text-secondary)"
    })
  }, "Foundation map")), /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: 14,
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 16,
    color: "var(--accent)"
  }), /*#__PURE__*/React.createElement("input", {
    value: query,
    onChange: e => setQuery(e.target.value),
    placeholder: "Federal youth workforce grants under $300K closing this quarter",
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--text-primary)'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, "Search"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 3fr',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 12,
      alignContent: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("p", {
    className: "fd-eyebrow",
    style: {
      margin: '0 0 12px',
      color: 'var(--text-tertiary)'
    }
  }, "Last discovery run"), [['Scanned', 1284], ['Stored', 197], ['High match', 12], ['Med match', 41]].map(([l, v]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fd-caption",
    style: {
      color: 'var(--text-secondary)'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    className: "fd-data",
    style: {
      color: 'var(--text-primary)'
    }
  }, v))), /*#__PURE__*/React.createElement("p", {
    className: "fd-caption",
    style: {
      margin: '10px 0 0',
      color: 'var(--text-tertiary)'
    }
  }, "Aug 8, 06:12")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("p", {
    className: "fd-eyebrow",
    style: {
      margin: '0 0 8px',
      color: 'var(--text-tertiary)'
    }
  }, "Scoring floor"), /*#__PURE__*/React.createElement("p", {
    className: "fd-caption",
    style: {
      margin: 0,
      color: 'var(--text-secondary)'
    }
  }, "Matches below 32 are discarded, not listed. Listing more is an anti-feature."))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(FilterBar, {
    chips: chipList,
    onClearAll: () => setChips({
      amount: null,
      deadline: null,
      source: null,
      funder: null,
      state: null
    })
  })), matches.length === 0 ? /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(EmptyState, {
    variant: "filtered-out",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "filter",
      size: 16,
      color: "var(--text-secondary)"
    }),
    title: "No matches with these filters",
    body: "Clear a dimension or widen the deadline window.",
    cta: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "secondary",
      onClick: () => {
        setChips({
          amount: null,
          deadline: null,
          source: null,
          funder: null,
          state: null
        });
        setQuery('');
      }
    }, "Clear filters")
  })) : /*#__PURE__*/React.createElement(RecommendationGroup, {
    pursue: {
      count: byRec('pursue').length,
      children: cards(byRec('pursue'))
    },
    maybe: {
      count: byRec('maybe').length,
      children: cards(byRec('maybe'))
    },
    skip: {
      count: byRec('skip').length,
      children: cards(byRec('skip'))
    }
  }))));
}
Object.assign(window, {
  MatchesScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/MatchesScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/PipelineScreen.jsx
try { (() => {
const {
  Button,
  Icon,
  ScoreBadge
} = window.FundirDesignSystem_eef84d;
const COLUMNS = [{
  id: 'discovered',
  label: 'Discovered',
  stripe: 'var(--text-secondary)'
}, {
  id: 'reviewing',
  label: 'Reviewing',
  stripe: 'var(--accent)'
}, {
  id: 'preparing',
  label: 'Preparing',
  stripe: 'var(--warning)'
}, {
  id: 'drafting',
  label: 'Drafting',
  stripe: 'var(--warning)'
}, {
  id: 'submitted',
  label: 'Submitted',
  stripe: 'var(--success)'
}];
function PipelineCard({
  m,
  onMove
}) {
  const days = m.deadlineDays;
  const deadlineColor = days == null ? 'var(--text-secondary)' : days <= 7 ? 'var(--critical)' : days <= 14 ? 'var(--warning)' : 'var(--text-secondary)';
  return /*#__PURE__*/React.createElement("div", {
    draggable: true,
    onDragStart: e => e.dataTransfer.setData('text/plain', m.id),
    style: {
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border-hairline)',
      padding: 12,
      cursor: 'grab'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fd-caption",
    style: {
      fontWeight: 600,
      color: 'var(--text-primary)',
      lineHeight: 1.35
    }
  }, m.title), /*#__PURE__*/React.createElement(ScoreBadge, {
    score: m.score
  })), /*#__PURE__*/React.createElement("p", {
    className: "fd-eyebrow",
    style: {
      margin: '0 0 8px',
      color: 'var(--text-secondary)',
      letterSpacing: '0.06em'
    }
  }, m.funder), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "fd-eyebrow",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: deadlineColor
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 12,
    color: deadlineColor
  }), days == null ? 'No deadline' : days < 0 ? 'Closed' : days === 0 ? 'Due today' : `${days}d left`), /*#__PURE__*/React.createElement("span", {
    className: "fd-eyebrow",
    style: {
      color: 'var(--text-muted)'
    }
  }, m.award)));
}
function PipelineScreen() {
  const data = window.FUNDIR_DATA;
  const [items, setItems] = React.useState(data.matches);
  const [over, setOver] = React.useState(null);
  const move = (id, stage) => setItems(list => list.map(m => m.id === id ? {
    ...m,
    stage
  } : m));
  const active = items.filter(m => ['reviewing', 'preparing', 'drafting'].includes(m.stage)).length;
  const urgent = items.filter(m => m.deadlineDays != null && m.deadlineDays >= 0 && m.deadlineDays <= 14).length;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      borderBottom: '1px solid var(--border-hairline)',
      background: 'var(--bg-page)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 32px',
      maxWidth: 1280,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "fd-h1",
    style: {
      margin: 0,
      color: 'var(--text-primary)'
    }
  }, "Grant pipeline"), /*#__PURE__*/React.createElement("p", {
    className: "fd-caption",
    style: {
      margin: '4px 0 0',
      color: 'var(--text-secondary)'
    }
  }, "Drag between stages \xB7 ", items.length, " total \xB7 click a grant title to open detail")), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    icon: /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 14,
      color: "var(--accent-on)"
    })
  }, "Run discovery")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: 24,
      marginTop: 16
    }
  }, [['Active', active, 'var(--text-primary)'], ['Urgent', urgent, urgent > 0 ? 'var(--critical)' : 'var(--text-primary)'], ['Potential', '$1.0M', 'var(--text-primary)']].map(([l, v, c]) => /*#__PURE__*/React.createElement("span", {
    key: l,
    className: "fd-caption",
    style: {
      color: 'var(--text-secondary)'
    }
  }, l, " ", /*#__PURE__*/React.createElement("strong", {
    className: "fd-mono",
    style: {
      fontSize: 17,
      fontWeight: 600,
      color: c,
      marginLeft: 6
    }
  }, v)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 32px',
      display: 'flex',
      gap: 16,
      overflowX: 'auto',
      alignItems: 'flex-start'
    }
  }, COLUMNS.map(col => {
    const colItems = items.filter(m => m.stage === col.id);
    return /*#__PURE__*/React.createElement("div", {
      key: col.id,
      style: {
        flexShrink: 0,
        width: 256
      }
    }, /*#__PURE__*/React.createElement("div", {
      onDragOver: e => {
        e.preventDefault();
        setOver(col.id);
      },
      onDragLeave: () => setOver(o => o === col.id ? null : o),
      onDrop: e => {
        e.preventDefault();
        move(e.dataTransfer.getData('text/plain'), col.id);
        setOver(null);
      },
      style: {
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        border: `1px solid ${over === col.id ? 'var(--accent)' : 'var(--border-hairline)'}`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 4,
        background: col.stripe
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-hairline)'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }
    }, /*#__PURE__*/React.createElement("h3", {
      className: "fd-body-strong",
      style: {
        margin: 0,
        color: 'var(--text-primary)',
        fontWeight: 600
      }
    }, col.label), /*#__PURE__*/React.createElement("span", {
      className: "fd-mono",
      style: {
        fontSize: 11,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-elevated)',
        color: 'var(--text-muted)'
      }
    }, colItems.length))), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 8,
        display: 'grid',
        gap: 8,
        minHeight: 120
      }
    }, colItems.map(m => /*#__PURE__*/React.createElement(PipelineCard, {
      key: m.id,
      m: m,
      onMove: move
    })), colItems.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        height: 64,
        border: `2px dashed ${over === col.id ? 'var(--accent)' : 'var(--border-hairline)'}`,
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "fd-caption",
      style: {
        color: 'var(--text-secondary)'
      }
    }, "Drop here")))));
  })));
}
Object.assign(window, {
  PipelineScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/PipelineScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/console/data.js
try { (() => {
// Sample data for the Fundir console kit. Shapes mirror the product's
// match_results / cra_intelligence / funder_intelligence view models.
window.FUNDIR_DATA = {
  org: {
    name: 'Chicago Youth Centers',
    logo: '../../assets/cyc-logo.png',
    ein: '36-2167940',
    email: 'dev@cyc.org'
  },
  provenance: {
    sources: 'IRS 990 FY2024 · GATA · CRA',
    synced: 'Aug 8'
  },
  ticker: ['197 opportunities tracked · 12 high-match', '4 deadlines closing within 14 days', '$4.2M in award potential · score-60+ grants', '6 CRA banks reach your community'],
  kpis: [{
    label: 'Tracked',
    value: 197,
    caption: '12 high-match',
    spark: '2,18 14,15 26,16 38,11 50,9 62,5'
  }, {
    label: 'Avg score',
    value: 61,
    caption: 'composite, all matches',
    spark: '2,13 14,12 26,14 38,12 50,13 62,12'
  }, {
    label: 'Award potential',
    value: 4180,
    pre: '$',
    suf: 'K',
    caption: 'score ≥ 60 grants',
    spark: '2,20 14,17 26,13 38,12 50,8 62,4'
  }, {
    label: 'Urgent',
    value: 4,
    tone: 'critical',
    caption: 'closing ≤ 14 days',
    spark: '2,8 14,10 26,12 38,14 50,15 62,17'
  }],
  cra: {
    meta: '6 banks · your West Side service area · $2.1M peer funding scanned',
    rows: [{
      name: 'Byline Bank',
      relationship: 'existing',
      action: 'deepen',
      einPending: false,
      confidence: 84,
      rationale: 'Assessment area covers all four of your program sites; gave to two peer youth agencies in the last CRA cycle.',
      chips: [{
        name: 'Metropolitan Family Services',
        amount: '$120K'
      }, {
        name: 'BUILD Chicago',
        amount: '$75K'
      }],
      more: 3
    }, {
      name: 'Wintrust Financial',
      relationship: 'prospect',
      action: 'open',
      einPending: false,
      confidence: 71,
      rationale: 'No prior contact. Community-development officer sits on two boards that overlap with yours.',
      chips: [{
        name: 'After School Matters',
        amount: '$95K'
      }],
      more: 4
    }, {
      name: 'First Midwest / Old National',
      relationship: 'prospect',
      action: 'monitor',
      einPending: true,
      confidence: 46,
      rationale: 'Post-merger assessment area still being redrawn; hold until the FY27 CRA plan publishes.',
      chips: [],
      more: 0
    }]
  },
  deadlines: [{
    title: 'Youth Workforce Development Initiative',
    agency: 'US Dept. of Labor',
    days: 1
  }, {
    title: 'Title I School Support Grant',
    agency: 'ISBE',
    days: 6
  }, {
    title: 'Community Health Equity Fund',
    agency: 'Cook County',
    days: 9
  }, {
    title: 'Neighborhood Revitalization Grant',
    agency: 'Illinois DCEO',
    days: 13
  }],
  funders: [{
    score: 88,
    name: 'Polk Bros. Foundation',
    peers: 9,
    amount: '$1.4M'
  }, {
    score: 81,
    name: 'Crown Family Philanthropies',
    peers: 7,
    amount: '$980K'
  }, {
    score: 74,
    name: 'The Chicago Community Trust',
    peers: 12,
    amount: '$2.3M'
  }, {
    score: 69,
    name: 'Robert R. McCormick Foundation',
    peers: 5,
    amount: '$620K'
  }, {
    score: 61,
    name: 'Lloyd A. Fry Foundation',
    peers: 4,
    amount: '$410K'
  }],
  matches: [{
    id: 'm1',
    stage: 'reviewing',
    eyebrow: 'UP TO $250K · FEDERAL · ALN 84.287',
    title: 'Youth Workforce Development Initiative',
    funder: 'U.S. Department of Labor',
    score: 94,
    recommendation: 'pursue',
    matchedProgram: 'Teen Leadership',
    deadlineDays: 1,
    award: '$250K',
    rationale: 'Budget band and NTEE code both line up; a prior DOL award strengthens the case.',
    evidence: [{
      text: 'Mission language overlaps 71% with the program description.',
      factor: 'semantic'
    }, {
      text: '990 budget of $4.2M sits inside the $1M–$10M award band.',
      factor: 'financial_990'
    }, {
      text: 'Eligible applicant type: 501(c)(3) with two years of audited financials.',
      factor: 'eligibility'
    }, {
      text: 'Agency funded three peer organizations in Cook County last cycle.',
      factor: 'funder_affinity'
    }]
  }, {
    id: 'm2',
    stage: 'preparing',
    eyebrow: 'UP TO $180K · FEDERAL · ALN 84.010',
    title: 'Title I School Support Grant',
    funder: 'Illinois State Board of Education',
    score: 78,
    recommendation: 'pursue',
    matchedProgram: 'Out-of-School Time',
    deadlineDays: 6,
    award: '$180K',
    rationale: 'Pass-through eligibility confirmed for community partners at three of your five sites.',
    evidence: [{
      text: 'Two partner schools are Title I designated for FY26.',
      factor: 'eligibility'
    }, {
      text: 'Revenue trend is flat, inside the stability band the reviewer scores on.',
      factor: 'financial_990'
    }]
  }, {
    id: 'm3',
    stage: 'discovered',
    eyebrow: 'UP TO $75K · FOUNDATION',
    title: 'After-School STEM Programs',
    funder: 'Polk Bros. Foundation',
    score: 61,
    recommendation: 'maybe',
    deadlineDays: 34,
    award: '$75K',
    rationale: 'Program fit is strong but the funder has never awarded outside its two anchor districts.',
    evidence: [{
      text: 'Nine peer organizations received awards from this funder.',
      factor: 'funder_affinity'
    }]
  }, {
    id: 'm4',
    stage: 'discovered',
    eyebrow: 'UP TO $50K · CORPORATE',
    title: 'Community Health Equity Fund',
    funder: 'Cook County Health Partners',
    score: 57,
    recommendation: 'maybe',
    deadlineDays: 9,
    award: '$50K',
    rationale: 'Health programming is a secondary program area; expect a weaker narrative than your youth work.'
  }, {
    id: 'm5',
    stage: 'discovered',
    eyebrow: 'UP TO $90K · STATE',
    title: 'Neighborhood Revitalization Grant',
    funder: 'Illinois DCEO',
    score: 38,
    recommendation: 'skip',
    deadlineDays: 13,
    award: '$90K',
    rationale: 'Requires a 25% capital match your current unrestricted balance cannot cover.'
  }, {
    id: 'm6',
    stage: 'submitted',
    eyebrow: 'UP TO $310K · FEDERAL · ALN 93.590',
    title: 'Community-Based Child Abuse Prevention',
    funder: 'HHS Administration for Children & Families',
    score: 82,
    recommendation: 'pursue',
    deadlineDays: -3,
    award: '$310K',
    rationale: 'Submitted Aug 4. Reviewer panel convenes in October.'
  }, {
    id: 'm7',
    stage: 'drafting',
    eyebrow: 'UP TO $120K · FOUNDATION',
    title: 'Teen Mentoring Capacity Fund',
    funder: 'Crown Family Philanthropies',
    score: 73,
    recommendation: 'pursue',
    deadlineDays: 21,
    award: '$120K',
    rationale: 'Draft at 60%. Outcome metrics still need the FY25 attendance figures.'
  }],
  flags: [{
    tone: 'warning',
    tag: 'Elevated',
    title: 'Top funder is 41% of contributed revenue',
    body: 'Two foundation applications this quarter would bring HHI back under the 0.25 threshold.'
  }, {
    tone: 'critical',
    tag: 'Exposed',
    title: 'Three ALNs sit in programs flagged for FY27 reduction',
    body: 'DOL 17.259 and ED 84.287 both appear in the House mark at reduced levels.'
  }, {
    tone: 'info',
    tag: 'Watch',
    title: 'Audited financials expire for grant cycles after Nov 30',
    body: 'FY25 audit is in fieldwork; schedule completion before the December federal window.'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/console/data.js", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Sections.jsx
try { (() => {
const {
  Icon
} = window.FundirDesignSystem_eef84d;
const MKT = {
  bg: '#0A0A0A',
  teal: '#0d9488',
  // the marketing site's lighter teal — not --accent
  grid: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)'
};
function LandingNav() {
  const link = {
    fontSize: 13,
    color: 'rgba(255,255,255,.45)',
    textDecoration: 'none'
  };
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      gap: 28,
      padding: '18px 48px',
      background: 'rgba(10,10,10,.72)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,.06)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/fundir-mark.png",
    alt: "Fundir",
    style: {
      width: 22,
      height: 22
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 15,
      fontWeight: 700,
      color: '#fff'
    }
  }, "Fundir")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 26
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#software",
    style: link
  }, "Software"), /*#__PURE__*/React.createElement("a", {
    href: "#capabilities",
    style: link
  }, "Capabilities"), /*#__PURE__*/React.createElement("a", {
    href: "#coverage",
    style: link
  }, "Coverage"), /*#__PURE__*/React.createElement("a", {
    href: "#cta",
    style: {
      ...link,
      color: '#fff',
      fontWeight: 600
    }
  }, "Sign in"), /*#__PURE__*/React.createElement("a", {
    href: "#cta",
    style: {
      background: '#fff',
      color: MKT.bg,
      fontSize: 13,
      fontWeight: 700,
      padding: '9px 16px',
      textDecoration: 'none'
    }
  }, "Get started")));
}
const TYPED = ['Nonprofits.', 'Foundations.', 'Grant Teams.'];
function HeroTypewriter() {
  const [i, setI] = React.useState(0);
  const [len, setLen] = React.useState(0);
  const [back, setBack] = React.useState(false);
  React.useEffect(() => {
    const word = TYPED[i];
    const t = setTimeout(() => {
      if (!back) {
        if (len < word.length) setLen(len + 1);else setTimeout(() => setBack(true), 1400);
      } else if (len > 0) setLen(len - 1);else {
        setBack(false);
        setI((i + 1) % TYPED.length);
      }
    }, back ? 34 : 78);
    return () => clearTimeout(t);
  }, [len, back, i]);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      color: MKT.teal
    }
  }, TYPED[i].slice(0, len), /*#__PURE__*/React.createElement("span", {
    style: {
      borderLeft: `3px solid ${MKT.teal}`,
      marginLeft: 2,
      animation: 'blink 1s steps(1) infinite'
    }
  }));
}
function GhostApp() {
  const rows = [{
    title: 'Youth Workforce Development Initiative',
    type: 'Federal',
    amount: '$250K',
    score: 94
  }, {
    title: 'After-School STEM Programs',
    type: 'Foundation',
    amount: '$75K',
    score: 87
  }, {
    title: 'Community Health Equity Fund',
    type: 'Corporate',
    amount: '$50K',
    score: 71
  }, {
    title: 'Title I School Support Grant',
    type: 'Federal',
    amount: '$180K',
    score: 63
  }, {
    title: 'Neighborhood Revitalization Grant',
    type: 'State',
    amount: '$90K',
    score: 58
  }];
  const typeColor = {
    Federal: '#2563eb',
    Foundation: '#7c3aed',
    Corporate: '#16a34a',
    State: '#d97706'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '62%',
      height: '100%',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 32,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,.08)',
      background: '#0f172a',
      opacity: 0.35
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 16px',
      background: '#1e293b',
      borderBottom: '1px solid rgba(255,255,255,.1)'
    }
  }, ['#ef4444', '#eab308', '#22c55e'].map(c => /*#__PURE__*/React.createElement("span", {
    key: c,
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: c,
      opacity: .6
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      marginLeft: 12,
      fontSize: 10,
      color: 'rgba(255,255,255,.25)'
    }
  }, "app.fundir.ai/dashboard")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 160,
      borderRight: '1px solid rgba(255,255,255,.1)',
      padding: 12,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 4,
      marginTop: 16
    }
  }, ['Dashboard', 'Discover', 'Financials', 'Pipeline', 'Calendar', 'Reports'].map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: it,
    style: {
      padding: '6px 10px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
      background: i === 0 ? 'rgba(13,148,136,.2)' : 'transparent',
      color: i === 0 ? '#2dd4bf' : 'rgba(255,255,255,.25)'
    }
  }, it)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: 16,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 8,
      marginBottom: 16
    }
  }, [['142', 'Tracked', '#2563eb'], ['23', 'High Match', '#0d9488'], ['$2.1M', 'Pipeline', '#7c3aed'], ['8', 'Due Soon', '#dc2626']].map(([n, l, c]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      background: 'rgba(255,255,255,.05)',
      borderRadius: 4,
      border: '1px solid rgba(255,255,255,.1)',
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: c
    }
  }, n), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      color: 'rgba(255,255,255,.25)',
      marginTop: 2
    }
  }, l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'rgba(255,255,255,.05)',
      borderRadius: 4,
      border: '1px solid rgba(255,255,255,.1)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      padding: '8px 12px',
      borderBottom: '1px solid rgba(255,255,255,.1)'
    }
  }, ['Grant', 'Type', 'Amount', 'Score'].map(h => /*#__PURE__*/React.createElement("span", {
    key: h,
    style: {
      flex: 1,
      fontSize: 9,
      fontWeight: 600,
      color: 'rgba(255,255,255,.25)',
      textTransform: 'uppercase',
      letterSpacing: '.06em'
    }
  }, h))), rows.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.title,
    style: {
      display: 'flex',
      gap: 12,
      padding: '8px 12px',
      borderBottom: '1px solid rgba(255,255,255,.05)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 10,
      color: 'rgba(255,255,255,.5)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, r.title), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 9,
      fontWeight: 600,
      color: typeColor[r.type]
    }
  }, r.type), /*#__PURE__*/React.createElement("span", {
    className: "fd-mono",
    style: {
      flex: 1,
      fontSize: 10,
      color: 'rgba(255,255,255,.35)'
    }
  }, r.amount), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 10,
      fontWeight: 700,
      color: r.score >= 70 ? '#0d9488' : '#d97706'
    }
  }, r.score)))))))));
}
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: MKT.bg
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: MKT.grid,
      backgroundSize: '60px 60px',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '25%',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 1200,
      height: 600,
      borderRadius: '50%',
      filter: 'blur(160px)',
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse, rgba(13,148,136,0.12), transparent 70%)'
    }
  }), /*#__PURE__*/React.createElement(GhostApp, null), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '96px 64px',
      maxWidth: 780
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      padding: '5px 12px',
      border: `1px solid rgba(13,148,136,.4)`,
      color: MKT.teal,
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '.14em',
      marginBottom: 32
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: MKT.teal
    }
  }), "AI Grant Intelligence Platform"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 68,
      fontWeight: 700,
      color: '#fff',
      lineHeight: 1.0,
      letterSpacing: '-0.03em',
      margin: '0 0 28px'
    }
  }, "AI-Powered Grant", /*#__PURE__*/React.createElement("br", null), "Intelligence for", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement(HeroTypewriter, null)), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 18,
      color: 'rgba(255,255,255,.45)',
      lineHeight: 1.6,
      maxWidth: 440,
      margin: '0 0 40px'
    }
  }, "Fundir connects your IRS 990, your mission, and the full federal and foundation grant landscape into a single intelligence platform."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#cta",
    style: {
      background: '#fff',
      color: MKT.bg,
      fontSize: 14,
      fontWeight: 700,
      padding: '15px 28px',
      textDecoration: 'none'
    }
  }, "Get started free \u2192"), /*#__PURE__*/React.createElement("a", {
    href: "#software",
    style: {
      border: '1px solid rgba(255,255,255,.2)',
      color: '#fff',
      fontSize: 14,
      fontWeight: 600,
      padding: '15px 28px',
      textDecoration: 'none'
    }
  }, "See the software"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      paddingBottom: 40,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'rgba(255,255,255,.25)',
      letterSpacing: '.16em',
      textTransform: 'uppercase',
      fontWeight: 500
    }
  }, "Scroll to explore"), /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-down",
    size: 16,
    color: "rgba(255,255,255,.25)"
  })));
}
function Statement() {
  return /*#__PURE__*/React.createElement("section", {
    id: "software",
    style: {
      padding: '128px 32px',
      background: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1000,
      margin: '0 auto',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: '.16em',
      margin: '0 0 32px'
    }
  }, "Our software"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 64,
      fontWeight: 700,
      color: '#0f172a',
      lineHeight: 1.1,
      letterSpacing: '-0.03em',
      margin: 0
    }
  }, "The grant world now has", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: MKT.teal
    }
  }, "an operating system.")), /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 32,
      fontSize: 20,
      color: '#475569',
      lineHeight: 1.6,
      maxWidth: 760,
      marginLeft: 'auto',
      marginRight: 'auto'
    }
  }, "Fundir doesn't just find grants \u2014 it scores them against your actual financial capacity, flags eligibility risks before you apply, and builds institutional knowledge from every outcome.")));
}
const PRODUCTS = [{
  tab: 'Grant Discovery',
  label: 'GRANT DISCOVERY',
  heading: 'Every relevant opportunity. Surfaced automatically.',
  body: "Fundir monitors federal, foundation, and corporate grant databases 24/7 — scoring each opportunity against your organization's financial profile, mission, and historical wins."
}, {
  tab: '990 Screening',
  label: '990 FINANCIAL SCREENING',
  heading: 'Your IRS 990, transformed into a competitive advantage.',
  body: 'Most nonprofits apply blind. Fundir reverse-scores every grant against your actual 990 data — budget fit, revenue diversification, financial stability, NTEE alignment — before you spend a single hour on an application.'
}, {
  tab: 'Pipeline',
  label: 'GRANT PIPELINE',
  heading: 'From discovery to award. One system of record.',
  body: 'Stage every opportunity from reviewing to submitted to awarded. Deadline tracking, task management, and grant notes — built for development teams.'
}, {
  tab: 'Risk Monitor',
  label: 'FEDERAL RISK RADAR',
  heading: 'Know which federal programs are at risk before the news does.',
  body: 'Fundir maps every federal grant in your 990 to current appropriations status — flagging concentration risk and identifying private alternatives before funding gaps emerge.'
}];
function ProductTabs() {
  const [active, setActive] = React.useState(0);
  const p = PRODUCTS[active];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: '#f8fafc',
      borderTop: '1px solid #e2e8f0',
      padding: '96px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1160,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 28,
      borderBottom: '1px solid #e2e8f0',
      marginBottom: 48
    }
  }, PRODUCTS.map((t, i) => /*#__PURE__*/React.createElement("button", {
    key: t.tab,
    onClick: () => setActive(i),
    style: {
      background: 'none',
      border: 'none',
      padding: '0 0 14px',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      fontWeight: 600,
      color: i === active ? '#0f172a' : '#94a3b8',
      borderBottom: i === active ? `2px solid ${MKT.teal}` : '2px solid transparent',
      marginBottom: -1
    }
  }, t.tab))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 780
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: MKT.teal,
      textTransform: 'uppercase',
      letterSpacing: '.16em',
      margin: '0 0 16px'
    }
  }, p.label), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 40,
      fontWeight: 700,
      color: '#0f172a',
      lineHeight: 1.15,
      letterSpacing: '-0.02em',
      margin: '0 0 20px'
    }
  }, p.heading), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      color: '#475569',
      lineHeight: 1.7,
      margin: 0
    }
  }, p.body))));
}
function Capabilities() {
  const cols = [{
    icon: 'bar-chart-3',
    color: MKT.teal,
    label: 'Financial Intelligence',
    heading: 'Instant 990 financial profiling',
    desc: 'Auto-matched by EIN. Fundir pulls your IRS 990, computes 7 financial eligibility signals per grant, and flags concentration risk before you apply.',
    preview: [['Budget Fit', 'match', '#16a34a', 92], ['Financial Stability', 'match', '#16a34a', 88], ['Revenue Trend', 'likely', '#d97706', 71], ['Mission Alignment', 'match', '#16a34a', 95], ['Exec Efficiency', 'match', '#16a34a', 83]]
  }, {
    icon: 'target',
    color: '#7c3aed',
    label: 'Match Scoring',
    heading: 'Know who welcomes your application',
    desc: 'A 7-factor composite score — semantic fit, financial eligibility, NTEE alignment, revenue trend, and more — ranked for every opportunity.',
    score: 91,
    factors: [['Semantic', 96, '#0d9488'], ['Financial', 88, '#7c3aed'], ['Eligibility', 90, '#2563eb']]
  }, {
    icon: 'clock',
    color: '#2563eb',
    label: 'Pipeline & Deadlines',
    heading: 'Never miss a deadline again',
    desc: 'Kanban pipeline, deadline calendar, task management, and grant notes — everything your development team needs to execute from discovery to award.',
    deadlines: [['HHS Youth Services', 4, '#dc2626'], ['Ford Foundation', 12, '#d97706'], ['DOE STEM Grant', 28, '#2563eb']]
  }];
  return /*#__PURE__*/React.createElement("section", {
    id: "capabilities",
    style: {
      padding: '96px 32px',
      background: '#fff',
      borderTop: '1px solid #e2e8f0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1160,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 64
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: MKT.teal,
      textTransform: 'uppercase',
      letterSpacing: '.16em',
      margin: '0 0 12px'
    }
  }, "Platform capabilities"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 40,
      fontWeight: 700,
      color: '#0f172a',
      lineHeight: 1.2,
      margin: 0
    }
  }, "Built for the full grant lifecycle.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 32
    }
  }, cols.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.label,
    style: {
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      borderBottom: '1px solid #e2e8f0',
      background: '#f8fafc'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 8,
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: c.color + '18'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: c.icon,
    size: 16,
    color: c.color
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '.16em',
      margin: '0 0 16px',
      color: c.color
    }
  }, c.label), c.preview && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 8
    }
  }, c.preview.map(([l, st, col, pct]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: '#475569',
      flex: 1
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 48,
      height: 4,
      background: '#f1f5f9',
      borderRadius: 999,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      display: 'block',
      height: '100%',
      width: pct + '%',
      background: col
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 600,
      width: 40,
      textAlign: 'right',
      color: col
    }
  }, st)))), c.score && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      border: '2px solid #16a34a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 700,
      color: '#16a34a'
    }
  }, c.score)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: '#16a34a',
      margin: 0
    }
  }, "Strong Match"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      color: '#94a3b8',
      margin: 0
    }
  }, "7-factor composite"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 6
    }
  }, c.factors.map(([l, v, col]) => /*#__PURE__*/React.createElement("div", {
    key: l
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: '#64748b'
    }
  }, l), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: col
    }
  }, v)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 4,
      background: '#f1f5f9',
      borderRadius: 999,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      display: 'block',
      height: '100%',
      width: v + '%',
      background: col
    }
  })))))), c.deadlines && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 8
    }
  }, c.deadlines.map(([t, d, col]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#f8fafc',
      borderRadius: 4,
      border: '1px solid #e2e8f0',
      padding: '8px 12px'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      color: '#0f172a',
      margin: 0
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 12,
    color: col
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      color: col
    }
  }, d, "d")))))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      background: '#fff',
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontWeight: 700,
      fontSize: 16,
      color: '#0f172a',
      margin: '0 0 8px'
    }
  }, c.heading), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: '#64748b',
      lineHeight: 1.6,
      margin: '0 0 16px',
      flex: 1
    }
  }, c.desc), /*#__PURE__*/React.createElement("a", {
    href: "#cta",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 13,
      fontWeight: 600,
      color: MKT.teal,
      textDecoration: 'none'
    }
  }, "Learn more ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 14,
    color: MKT.teal
  }))))))));
}
function DarkStats() {
  const stats = [['1,200+', 'Federal grants indexed'], ['7-factor', 'Financial eligibility engine'], ['990 sync', 'Automatic EIN matching'], ['<30s', 'Per-grant AI processing']];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: '128px 32px',
      background: MKT.bg
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1000,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: MKT.teal,
      textTransform: 'uppercase',
      letterSpacing: '.16em',
      margin: '0 0 32px'
    }
  }, "Why Fundir"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 58,
      fontWeight: 700,
      color: '#fff',
      lineHeight: 1.05,
      letterSpacing: '-0.03em',
      margin: 0,
      maxWidth: 900
    }
  }, "Fundir scores financial eligibility against every grant \u2014 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'rgba(255,255,255,.25)'
    }
  }, "before you spend a single hour applying.")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 80,
      display: 'grid',
      gridTemplateColumns: 'repeat(4,1fr)',
      gap: 1,
      background: 'rgba(255,255,255,.1)'
    }
  }, stats.map(([v, l]) => /*#__PURE__*/React.createElement("div", {
    key: l,
    style: {
      background: MKT.bg,
      padding: '40px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fd-mono",
    style: {
      fontSize: 36,
      fontWeight: 700,
      color: MKT.teal,
      marginBottom: 8
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'rgba(255,255,255,.35)'
    }
  }, l))))));
}
function Coverage() {
  const areas = ['Education', 'Youth Development', 'Health & Wellness', 'Community Development', 'Arts & Culture', 'Housing & Shelter', 'Environmental', 'Human Services', 'Faith-Based', 'Workforce', 'Mental Health', 'Food Security', 'Civil Rights', 'Science & Tech', 'International', 'Philanthropy'];
  const types = [['shield', 'Federal Grants', 'Government grants via Grants.gov — auto-discovered daily'], ['target', 'Foundation Grants', 'Private & family foundations matched to your mission profile'], ['trending-up', 'Corporate Grants', 'Corporate giving programs aligned to your program areas'], ['file-text', 'State & Local', 'State agency grants and municipal funding opportunities']];
  return /*#__PURE__*/React.createElement("section", {
    id: "coverage",
    style: {
      padding: '80px 32px',
      background: '#fff',
      borderTop: '1px solid #e2e8f0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1160,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: MKT.teal,
      textTransform: 'uppercase',
      letterSpacing: '.16em',
      margin: '0 0 8px'
    }
  }, "Coverage"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 32,
      fontWeight: 700,
      color: '#0f172a',
      margin: '0 0 40px'
    }
  }, "Every mission area. Every funder type."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 48
    }
  }, areas.map(a => /*#__PURE__*/React.createElement("span", {
    key: a,
    style: {
      padding: '6px 16px',
      border: '1px solid #e2e8f0',
      fontSize: 13,
      color: '#475569'
    }
  }, a))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, types.map(([ic, label, desc]) => /*#__PURE__*/React.createElement("div", {
    key: label,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 16,
      padding: 20,
      border: '1px solid #e2e8f0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      background: '#f0fdfa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 16,
    color: MKT.teal
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      fontWeight: 600,
      color: '#0f172a',
      margin: '0 0 2px'
    }
  }, label), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: '#64748b',
      margin: 0
    }
  }, desc)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      flexShrink: 0,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    color: "#e2e8f0"
  })))))));
}
function FinalCta() {
  return /*#__PURE__*/React.createElement("section", {
    id: "cta",
    style: {
      position: 'relative',
      padding: '128px 32px',
      background: MKT.bg,
      overflow: 'hidden',
      borderTop: '1px solid rgba(255,255,255,.05)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 800,
      height: 400,
      borderRadius: '50%',
      filter: 'blur(120px)',
      background: 'radial-gradient(ellipse, rgba(13,148,136,0.1), transparent 70%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 620,
      margin: '0 auto',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: MKT.teal,
      textTransform: 'uppercase',
      letterSpacing: '.16em',
      margin: '0 0 24px'
    }
  }, "Ready to get started?"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 48,
      fontWeight: 700,
      color: '#fff',
      lineHeight: 1.15,
      margin: '0 0 24px'
    }
  }, "Find your next grant today."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 16,
      color: 'rgba(255,255,255,.4)',
      lineHeight: 1.7,
      margin: '0 0 40px'
    }
  }, "Invite-only access for nonprofits. Request your invite to get started."), /*#__PURE__*/React.createElement("a", {
    href: "#cta",
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 32px',
      background: '#fff',
      color: MKT.bg,
      fontWeight: 700,
      fontSize: 14,
      textDecoration: 'none'
    }
  }, "Get started free ", /*#__PURE__*/React.createElement("span", null, "\u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      gap: 24,
      marginTop: 32,
      fontSize: 12,
      color: 'rgba(255,255,255,.25)'
    }
  }, ['No credit card required', 'Live in minutes', 'IRS 990 auto-sync'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check-circle",
    size: 14,
    color: MKT.teal
  }), " ", t)))));
}
function SiteFooter() {
  const link = {
    fontSize: 12,
    color: 'rgba(255,255,255,.25)',
    textDecoration: 'none'
  };
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      borderTop: '1px solid rgba(255,255,255,.08)',
      padding: '40px 48px',
      background: MKT.bg
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1160,
      margin: '0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/fundir-mark.png",
    alt: "Fundir",
    width: "24",
    height: "24",
    style: {
      opacity: .4
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 700,
      color: 'rgba(255,255,255,.5)'
    }
  }, "Fundir"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'rgba(255,255,255,.2)'
    }
  }, "\xB7 AI Grant Intelligence")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#cta",
    style: link
  }, "Sign in"), /*#__PURE__*/React.createElement("a", {
    href: "#cta",
    style: link
  }, "Get started"), /*#__PURE__*/React.createElement("p", {
    style: {
      ...link,
      margin: 0,
      color: 'rgba(255,255,255,.15)'
    }
  }, "\xA9 2026 Fundir"))));
}
Object.assign(window, {
  LandingNav,
  Hero,
  Statement,
  ProductTabs,
  Capabilities,
  DarkStats,
  Coverage,
  FinalCta,
  SiteFooter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Sections.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.CardHeader = __ds_scope.CardHeader;

__ds_ns.CardSection = __ds_scope.CardSection;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.StatusTag = __ds_scope.StatusTag;

__ds_ns.ConfidenceBar = __ds_scope.ConfidenceBar;

__ds_ns.EvidenceList = __ds_scope.EvidenceList;

__ds_ns.FigureHeading = __ds_scope.FigureHeading;

__ds_ns.KpiCard = __ds_scope.KpiCard;

__ds_ns.RiskFlagRow = __ds_scope.RiskFlagRow;

__ds_ns.ScoreBadge = __ds_scope.ScoreBadge;

__ds_ns.FilterBar = __ds_scope.FilterBar;

__ds_ns.GrantCard = __ds_scope.GrantCard;

__ds_ns.RecommendationGroup = __ds_scope.RecommendationGroup;

__ds_ns.RecommendationPill = __ds_scope.RecommendationPill;

__ds_ns.SidebarNav = __ds_scope.SidebarNav;

__ds_ns.TopBar = __ds_scope.TopBar;

})();
