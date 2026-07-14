(function initMasterReferenceUtils(global) {
  function stripHtml(value) {
    const tmp = document.createElement("div");
    tmp.innerHTML = value || "";
    return (tmp.textContent || tmp.innerText || "").trim();
  }

  function htmlToPlainText(value) {
    const normalized = String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ");

    const tmp = document.createElement("div");
    tmp.innerHTML = normalized;

    return (tmp.textContent || tmp.innerText || "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeKey(value) {
    return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function normalizeStatsGender(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "female" || normalized === "male" || normalized === "other") {
      return normalized;
    }
    return "";
  }

  function unique(items) {
    return Array.from(new Set(items));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseIsoDate(value) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const date = new Date(`${value.trim()}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
  }

  function buildUtcDate(year, monthIndex, day) {
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
      return null;
    }

    const date = new Date(Date.UTC(year, monthIndex, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== monthIndex
      || date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function calculateAgeAtDate(birthDate, referenceDate) {
    if (!birthDate || !referenceDate) {
      return null;
    }

    let age = referenceDate.getUTCFullYear() - birthDate.getUTCFullYear();
    const referenceMonthDay = (referenceDate.getUTCMonth() * 100) + referenceDate.getUTCDate();
    const birthMonthDay = (birthDate.getUTCMonth() * 100) + birthDate.getUTCDate();
    if (referenceMonthDay < birthMonthDay) {
      age -= 1;
    }

    return age >= 0 ? age : null;
  }

  function formatBirthdayLong(birthDate) {
    if (!birthDate) {
      return "";
    }

    return birthDate.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).toLowerCase();
  }

  function computeAverage(values) {
    const safeValues = Array.isArray(values) ? values : [];
    if (!safeValues.length) {
      return null;
    }
    const sum = safeValues.reduce((acc, value) => acc + value, 0);
    return sum / safeValues.length;
  }

  function computeMedian(values) {
    const safeValues = Array.isArray(values) ? values : [];
    if (!safeValues.length) {
      return null;
    }
    const sorted = [...safeValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  function formatStatsLabel(value) {
    return String(value || "")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function getRaceChartColor(label) {
    const key = String(label || "").trim().toLowerCase();
    const colorByLabel = {
      white: "#cfd4dc",
      black: "#2f3136",
      asian: "#f2b34f",
      latino: "#4f8df2",
      other: "#9b59b6",
      unknown: "#7f8c8d"
    };
    return colorByLabel[key] || "#7f8c8d";
  }

  function toRaceKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getPiePoint(center, radius, angleInDegrees) {
    const radians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(radians),
      y: center + radius * Math.sin(radians)
    };
  }

  function getPieSlicePath(center, radius, startAngle, endAngle) {
    const start = getPiePoint(center, radius, startAngle);
    const end = getPiePoint(center, radius, endAngle);
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${center} ${center}`,
      `L ${start.x.toFixed(4)} ${start.y.toFixed(4)}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(4)} ${end.y.toFixed(4)}`,
      "Z"
    ].join(" ");
  }

  function isImageFile(fileName) {
    return /\.(png|jpe?g|webp|gif|avif)$/i.test(fileName || "");
  }

  function isVideoFile(fileName) {
    return /\.mp4$/i.test(fileName || "");
  }

  function isMediaFile(fileName) {
    return isImageFile(fileName) || isVideoFile(fileName);
  }

  function baseName(fileName) {
    return (fileName || "")
      .split("/")
      .pop()
      .split("?")[0]
      .replace(/\.[^.]+$/, "");
  }

  function toFileName(pathOrHref) {
    return decodeURIComponent((pathOrHref || "").split("/").pop().split("?")[0]);
  }

  function prettyArchiveName(fileName) {
    return (fileName || "")
      .replace(/\.html$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function parsePipeList(value) {
    return (value || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  global.MasterReferenceUtils = {
    stripHtml,
    htmlToPlainText,
    normalizeKey,
    normalizeStatsGender,
    unique,
    escapeHtml,
    parseIsoDate,
    buildUtcDate,
    calculateAgeAtDate,
    formatBirthdayLong,
    computeAverage,
    computeMedian,
    formatStatsLabel,
    getRaceChartColor,
    toRaceKey,
    getPiePoint,
    getPieSlicePath,
    isImageFile,
    isVideoFile,
    isMediaFile,
    baseName,
    toFileName,
    prettyArchiveName,
    parsePipeList,
    escapeRegex
  };
}(window));
