(function initMasterReferenceExportModal(global) {
  function initExportModal(options) {
    const cfg = options || {};
    const exportModal = document.getElementById("export-modal");
    const exportModalClose = document.getElementById("export-modal-close");
    const exportSelectAll = document.getElementById("export-select-all");
    const exportDeselectAll = document.getElementById("export-deselect-all");
    const exportModalBody = document.getElementById("export-modal-body");
    const exportModalConfirm = document.getElementById("export-modal-confirm");

    let currentExportMode = "json";

    function updateGroupCheckboxState(groupCheckbox, itemsContainer) {
      const checkboxes = Array.from(itemsContainer.querySelectorAll(".export-item-checkbox"));
      const allChecked = checkboxes.every((cb) => cb.checked);
      const someChecked = checkboxes.some((cb) => cb.checked);

      groupCheckbox.checked = allChecked;
      groupCheckbox.indeterminate = !allChecked && someChecked;
    }

    function populateExportModal() {
      if (!exportModalBody || typeof cfg.buildGroups !== "function") {
        return;
      }

      exportModalBody.innerHTML = "";
      const entries = typeof cfg.getEntries === "function" ? cfg.getEntries() : [];
      const groups = cfg.buildGroups(entries, "standard", "");

      groups.forEach((group) => {
        const groupEl = document.createElement("div");
        groupEl.className = "export-modal-group";

        const header = document.createElement("div");
        header.className = "export-modal-group-header";

        const groupCheckbox = document.createElement("input");
        groupCheckbox.type = "checkbox";
        groupCheckbox.className = "export-modal-checkbox";
        groupCheckbox.checked = true;
        groupCheckbox.dataset.group = group.label;

        const title = document.createElement("span");
        title.textContent = group.label;

        header.appendChild(groupCheckbox);
        header.appendChild(title);

        const itemsContainer = document.createElement("div");
        itemsContainer.className = "export-modal-group-items";

        group.items.forEach((item) => {
          const itemEl = document.createElement("label");
          itemEl.className = "export-modal-item";

          const itemCheckbox = document.createElement("input");
          itemCheckbox.type = "checkbox";
          itemCheckbox.className = "export-modal-checkbox export-item-checkbox";
          itemCheckbox.checked = true;
          itemCheckbox.value = item.id;
          itemCheckbox.dataset.group = group.label;

          const itemName = document.createElement("span");
          const icon = typeof cfg.renderCharacterIconMarkup === "function"
            ? cfg.renderCharacterIconMarkup(item.id)
            : "";
          const label = typeof cfg.escapeHtml === "function"
            ? cfg.escapeHtml(item.navLabel || item.id)
            : String(item.navLabel || item.id || "");
          itemName.innerHTML = icon + label;

          itemEl.appendChild(itemCheckbox);
          itemEl.appendChild(itemName);
          itemsContainer.appendChild(itemEl);

          itemCheckbox.addEventListener("change", () => {
            updateGroupCheckboxState(groupCheckbox, itemsContainer);
          });
        });

        groupCheckbox.addEventListener("change", (e) => {
          const isChecked = e.target.checked;
          const checkboxes = itemsContainer.querySelectorAll(".export-item-checkbox");
          checkboxes.forEach((cb) => {
            cb.checked = isChecked;
          });
        });

        groupEl.appendChild(header);
        groupEl.appendChild(itemsContainer);
        exportModalBody.appendChild(groupEl);
      });
    }

    function closeExportModal() {
      if (!exportModal) {
        return;
      }
      exportModal.hidden = true;
      document.body.style.overflow = "";
    }

    function openExportModal(mode) {
      if (!exportModal || !exportModalConfirm) {
        return;
      }
      currentExportMode = mode;
      exportModalConfirm.textContent = mode === "json" ? "Export JSON" : "Export Story";
      populateExportModal();
      exportModal.hidden = false;
      document.body.style.overflow = "hidden";
    }

    exportModalClose?.addEventListener("click", closeExportModal);

    exportModal?.addEventListener("click", (e) => {
      if (e.target === exportModal) {
        closeExportModal();
      }
    });

    exportSelectAll?.addEventListener("click", () => {
      const checkboxes = exportModalBody?.querySelectorAll(".export-modal-checkbox") || [];
      checkboxes.forEach((cb) => {
        cb.checked = true;
        cb.indeterminate = false;
      });
    });

    exportDeselectAll?.addEventListener("click", () => {
      const checkboxes = exportModalBody?.querySelectorAll(".export-modal-checkbox") || [];
      checkboxes.forEach((cb) => {
        cb.checked = false;
        cb.indeterminate = false;
      });
    });

    exportModalConfirm?.addEventListener("click", () => {
      const selectedCheckboxes = exportModalBody?.querySelectorAll(".export-item-checkbox:checked") || [];
      const selectedIds = Array.from(selectedCheckboxes).map((cb) => cb.value);
      const entries = typeof cfg.getEntries === "function" ? cfg.getEntries() : [];
      const customEntries = entries.filter((entry) => selectedIds.includes(entry.id));

      if (currentExportMode === "json") {
        if (typeof cfg.onExportJson === "function") {
          cfg.onExportJson(customEntries);
        }
      } else if (typeof cfg.onExportStory === "function") {
        cfg.onExportStory(customEntries);
      }

      closeExportModal();
    });

    return {
      openExportModal,
      closeExportModal
    };
  }

  global.MasterReferenceExportModal = {
    initExportModal
  };
}(window));
