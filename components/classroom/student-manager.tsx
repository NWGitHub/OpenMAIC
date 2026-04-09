'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  createClassroomStudent,
  deleteClassroomStudent,
  listClassroomStudents,
  updateClassroomStudent,
  type ClassroomStudent,
} from '@/lib/utils/classroom-student-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('StudentManager');

interface StudentManagerProps {
  stageId: string;
}

interface StudentFormState {
  name: string;
  email: string;
  notes: string;
}

const INITIAL_FORM: StudentFormState = {
  name: '',
  email: '',
  notes: '',
};

export function StudentManager({ stageId }: StudentManagerProps) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<ClassroomStudent[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StudentFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  const loadStudents = useCallback(async () => {
    if (!stageId) return;
    const data = await listClassroomStudents(stageId);
    setStudents(data);
  }, [stageId]);

  const notifyStudentsUpdated = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('classroom-students-updated', {
        detail: { stageId },
      }),
    );
  }, [stageId]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const resetForm = () => {
    setEditingId(null);
    setForm(INITIAL_FORM);
  };

  const activeTitle = useMemo(() => {
    return editingId ? 'Edit Student' : 'Add Student';
  }, [editingId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    setSaving(true);
    try {
      if (editingId) {
        await updateClassroomStudent(stageId, editingId, {
          name,
          email: form.email,
          notes: form.notes,
        });
      } else {
        await createClassroomStudent(stageId, {
          name,
          email: form.email,
          notes: form.notes,
        });
      }
      await loadStudents();
      notifyStudentsUpdated();
      resetForm();
    } catch (error) {
      log.error('Failed to save student:', error);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (student: ClassroomStudent) => {
    setEditingId(student.id);
    setForm({
      name: student.name,
      email: student.email || '',
      notes: student.notes || '',
    });
  };

  const onDelete = async (student: ClassroomStudent) => {
    const ok = window.confirm(`Delete student \"${student.name}\"?`);
    if (!ok) return;
    try {
      await deleteClassroomStudent(stageId, student.id);
      await loadStudents();
      notifyStudentsUpdated();
      if (editingId === student.id) {
        resetForm();
      }
    } catch (error) {
      log.error('Failed to delete student:', error);
    }
  };

  return (
    <div className="absolute top-4 right-4 z-40">
      {!open ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Users className="size-4" />
          Students
        </Button>
      ) : (
        <div className="w-[360px] max-w-[90vw] rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur shadow-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-gray-600 dark:text-gray-300" />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Classroom Students
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">({students.length})</span>
            </div>
            <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>

          <form onSubmit={onSubmit} className="rounded-lg border border-gray-100 dark:border-gray-700 p-2.5 space-y-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{activeTitle}</p>
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Name"
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm"
              required
            />
            <input
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Email (optional)"
              className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm"
              type="email"
            />
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notes (optional)"
              className="w-full min-h-[70px] rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm resize-none"
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={saving}>
                {editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {editingId ? 'Update' : 'Create'}
              </Button>
              {editingId && (
                <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
            {students.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">No students yet.</p>
            ) : (
              students.map((student) => (
                <div
                  key={student.id}
                  className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {student.name}
                      </p>
                      {student.email && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {student.email}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon-xs" variant="ghost" onClick={() => startEdit(student)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => onDelete(student)}>
                        <Trash2 className="size-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  {student.notes && (
                    <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {student.notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
