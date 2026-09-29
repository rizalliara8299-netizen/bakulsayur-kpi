// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type EditorState =
  | { type: "kpi"; item: any }
  | { type: "employee"; item: any }
  | null;

type DeleteState =
  | { type: "kpi"; item: any; label: string }
  | { type: "employee"; item: any; label: string }
  | { type: "task"; item: any; label: string }
  | null;

function text(el: Element | null) {
  return (el?.textContent || "").trim();
}

function findSectionByHeading(title: string) {
  return Array.from(document.querySelectorAll("section")).find((section) =>
    Array.from(section.querySelectorAll("h2")).some((heading) => text(heading) === title),
  ) as HTMLElement | undefined;
}

function makeActionButton(label: string, className: string, handler: () => void) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
  return button;
}

export function MasterCrudEnhancer() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [bundle, setBundle] = useState<any>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteState>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/dashboard") return;
    const saved = window.sessionStorage.getItem("master-crud-toast");
    if (saved) {
      window.sessionStorage.removeItem("master-crud-toast");
      setNotice(saved);
      window.setTimeout(() => setNotice(""), 4500);
    }

    let cancelled = false;
    supabase.rpc("get_unified_app_bundle").then(({ data, error }) => {
      if (cancelled || error || !data?.admin) return;
      setBundle(data);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!bundle?.admin) return;

    let timer: number | undefined;

    const enhanceKpiTable = () => {
      const section = findSectionByHeading("Master KPI Produksi");
      const table = section?.querySelector("table");
      if (!table) return;

      const headRow = table.querySelector("thead tr");
      if (headRow && !headRow.querySelector('[data-master-actions-head="kpi"]')) {
        const th = document.createElement("th");
        th.textContent = "Aksi";
        th.dataset.masterActionsHead = "kpi";
        th.className = "master-actions-head";
        headRow.appendChild(th);
      }

      table.querySelectorAll("tbody tr").forEach((row) => {
        if (row.querySelector('[data-master-actions-cell="kpi"]')) return;
        const cells = row.querySelectorAll("td");
        if (!cells.length) return;
        const code = text(cells[0]);
        const item = (bundle.kpis || []).find((k: any) => String(k.code) === code);
        if (!item) return;

        const td = document.createElement("td");
        td.dataset.masterActionsCell = "kpi";
        const wrap = document.createElement("div");
        wrap.className = "master-inline-actions";
        wrap.appendChild(makeActionButton("Edit", "btn btn-soft", () => {
          setErrorText("");
          setEditor({ type: "kpi", item });
        }));
        wrap.appendChild(makeActionButton("Hapus", "btn btn-danger", () => {
          setErrorText("");
          setDeleteTarget({ type: "kpi", item, label: `${item.code} · ${item.name}` });
        }));
        td.appendChild(wrap);
        row.appendChild(td);
      });
    };

    const enhanceEmployeeTable = () => {
      const section = findSectionByHeading("Daftar Karyawan");
      const table = section?.querySelector("table");
      if (!table) return;

      const headRow = table.querySelector("thead tr");
      if (headRow && !headRow.querySelector('[data-master-actions-head="employee"]')) {
        const th = document.createElement("th");
        th.textContent = "Aksi";
        th.dataset.masterActionsHead = "employee";
        th.className = "master-actions-head";
        headRow.appendChild(th);
      }

      table.querySelectorAll("tbody tr").forEach((row) => {
        if (row.querySelector('[data-master-actions-cell="employee"]')) return;
        const cells = row.querySelectorAll("td");
        if (!cells.length) return;
        const code = text(cells[0]);
        const item = (bundle.employees || []).find((employee: any) => String(employee.code) === code);
        if (!item) return;

        const td = document.createElement("td");
        td.dataset.masterActionsCell = "employee";
        const wrap = document.createElement("div");
        wrap.className = "master-inline-actions";
        wrap.appendChild(makeActionButton("Edit", "btn btn-soft", () => {
          setErrorText("");
          setEditor({ type: "employee", item });
        }));
        wrap.appendChild(makeActionButton("Hapus", "btn btn-danger", () => {
          setErrorText("");
          setDeleteTarget({ type: "employee", item, label: `${item.code} · ${item.name}` });
        }));
        td.appendChild(wrap);
        row.appendChild(td);
      });
    };

    const enhanceInventoryTasks = () => {
      const section = findSectionByHeading("Master Checklist Inventory");
      if (!section) return;
      section.querySelectorAll(".inventory-master-row").forEach((row) => {
        if (row.querySelector('[data-master-delete="task"]')) return;
        const name = text(row.querySelector("strong"));
        const item = (bundle.tasks || []).find((task: any) => String(task.name) === name);
        if (!item) return;
        const actions = row.lastElementChild as HTMLElement | null;
        if (!actions) return;
        const button = makeActionButton("Hapus", "btn btn-danger", () => {
          setErrorText("");
          setDeleteTarget({ type: "task", item, label: item.name });
        });
        button.dataset.masterDelete = "task";
        actions.appendChild(button);
      });
    };

    const enhance = () => {
      enhanceKpiTable();
      enhanceEmployeeTable();
      enhanceInventoryTasks();
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(enhance, 80);
    };

    enhance();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [bundle]);

  async function saveEditor(event: any) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setErrorText("");
    const fd = new FormData(event.currentTarget);

    try {
      let result: any;
      if (editor.type === "kpi") {
        result = await supabase.rpc("update_kpi_master", {
          p_id: editor.item.id,
          p_code: String(fd.get("code") || "").trim(),
          p_name: String(fd.get("name") || "").trim(),
          p_unit: String(fd.get("unit") || "").trim(),
          p_points: Number(fd.get("points") || 0),
          p_effective_from: String(fd.get("effectiveFrom") || ""),
          p_active: String(fd.get("active")) === "true",
        });
      } else {
        result = await supabase.rpc("update_employee_master", {
          p_id: editor.item.id,
          p_code: String(fd.get("code") || "").trim(),
          p_name: String(fd.get("name") || "").trim(),
          p_team_id: String(fd.get("teamId") || ""),
          p_status: String(fd.get("status") || "active"),
        });
      }

      if (result?.error) throw result.error;
      window.sessionStorage.setItem(
        "master-crud-toast",
        editor.type === "kpi" ? "KPI berhasil diperbarui." : "Data karyawan berhasil diperbarui.",
      );
      window.location.reload();
    } catch (error: any) {
      setErrorText(error?.message || "Perubahan gagal disimpan.");
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setErrorText("");
    try {
      const functionName =
        deleteTarget.type === "kpi"
          ? "delete_kpi_master"
          : deleteTarget.type === "employee"
            ? "delete_employee_master"
            : "delete_inventory_task_master";
      const { error } = await supabase.rpc(functionName, { p_id: deleteTarget.item.id });
      if (error) throw error;
      window.sessionStorage.setItem("master-crud-toast", `${deleteTarget.label} berhasil dihapus dari master data.`);
      window.location.reload();
    } catch (error: any) {
      setErrorText(error?.message || "Data gagal dihapus.");
      setSaving(false);
    }
  }

  if (!bundle?.admin) return null;

  return (
    <>
      {notice ? <div className="master-crud-toast">✓ {notice}</div> : null}

      {editor ? (
        <div className="master-crud-backdrop" role="presentation" onMouseDown={() => !saving && setEditor(null)}>
          <div className="master-crud-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="master-crud-modal-head">
              <div>
                <span className="master-crud-eyebrow">EDIT MASTER DATA</span>
                <h3>{editor.type === "kpi" ? "Edit KPI Produksi" : "Edit Data Karyawan"}</h3>
                <p>Perubahan langsung tersinkron ke seluruh modul setelah disimpan.</p>
              </div>
              <button type="button" className="master-crud-close" onClick={() => !saving && setEditor(null)}>×</button>
            </div>

            <form onSubmit={saveEditor} className="master-crud-form">
              {editor.type === "kpi" ? (
                <>
                  <label><span>Kode KPI</span><input name="code" defaultValue={editor.item.code} required /></label>
                  <label><span>Nama KPI</span><input name="name" defaultValue={editor.item.name} required /></label>
                  <label><span>Satuan</span><input name="unit" defaultValue={editor.item.unit || ""} required /></label>
                  <label><span>Poin / Satuan</span><input name="points" type="number" step="0.01" min="0" defaultValue={editor.item.points ?? 0} required /></label>
                  <label><span>Berlaku Mulai</span><input name="effectiveFrom" type="date" defaultValue={editor.item.effectiveFrom || bundle.today} required /></label>
                  <label><span>Status</span><select name="active" defaultValue={String(editor.item.active)}><option value="true">Aktif</option><option value="false">Nonaktif</option></select></label>
                </>
              ) : (
                <>
                  <label><span>Kode Karyawan</span><input name="code" defaultValue={editor.item.code} required /></label>
                  <label><span>Nama Karyawan</span><input name="name" defaultValue={editor.item.name} required /></label>
                  <label><span>Tim</span><select name="teamId" defaultValue={editor.item.teamId} required>{(bundle.teams || []).map((team: any) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                  <label><span>Status</span><select name="status" defaultValue={editor.item.status || "active"}><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>
                </>
              )}

              {errorText ? <div className="master-crud-error">{errorText}</div> : null}
              <div className="master-crud-actions">
                <button type="button" className="btn btn-soft" disabled={saving} onClick={() => setEditor(null)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="master-crud-backdrop" role="presentation" onMouseDown={() => !saving && setDeleteTarget(null)}>
          <div className="master-crud-modal master-crud-delete-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="master-delete-icon">!</div>
            <div className="master-crud-modal-head delete-head">
              <div>
                <span className="master-crud-eyebrow danger">HAPUS MASTER DATA</span>
                <h3>Hapus {deleteTarget.label}?</h3>
                <p>Item akan hilang dari pilihan master dan input baru. Histori transaksi lama tetap dipertahankan agar laporan tidak rusak.</p>
              </div>
            </div>
            {errorText ? <div className="master-crud-error">{errorText}</div> : null}
            <div className="master-crud-actions">
              <button type="button" className="btn btn-soft" disabled={saving} onClick={() => setDeleteTarget(null)}>Batal</button>
              <button type="button" className="btn btn-danger" disabled={saving} onClick={confirmDelete}>{saving ? "Menghapus…" : "Ya, Hapus"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
