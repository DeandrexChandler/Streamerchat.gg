"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "../../../components/DashboardLayout";
import {
  loadSettings,
  savePreset,
  loadPreset,
  deletePreset,
  exportSettings,
  importSettings,
  type SavedPreset,
} from "@/lib/settings";
import {
  Save,
  Download,
  Upload,
  Trash2,
  Package,
  AlertTriangle,
  User,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

export default function MoreSettingsPage() {
  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null
  );

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = () => {
    const settings = loadSettings();
    setPresets(settings.presets || []);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      toast.error("Please enter a preset name");
      return;
    }

    try {
      const settings = loadSettings();
      savePreset(newPresetName, settings.simulation);
      setNewPresetName("");
      loadPresets();
      toast.success(`Preset "${newPresetName}" saved`);
    } catch (error) {
      toast.error("Failed to save preset");
    }
  };

  const handleLoadPreset = (presetId: string) => {
    try {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        loadPreset(presetId);
        toast.success(`Loaded preset "${preset.name}"`);
      }
    } catch (error) {
      toast.error("Failed to load preset");
    }
  };

  const handleDeletePreset = (presetId: string) => {
    try {
      const preset = presets.find((p) => p.id === presetId);
      deletePreset(presetId);
      loadPresets();
      toast.success(`Deleted preset "${preset?.name}"`);
      setShowDeleteConfirm(null);
    } catch (error) {
      toast.error("Failed to delete preset");
    }
  };

  const handleExport = () => {
    try {
      const settings = loadSettings();
      const json = JSON.stringify(settings, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `streamerchatai-settings-${
        new Date().toISOString().split("T")[0]
      }.json`;
      a.click();
      toast.success("Settings exported");
    } catch (error) {
      toast.error("Failed to export settings");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await importSettings(file);
      loadPresets();
      toast.success("Settings imported successfully");
    } catch (error) {
      toast.error("Failed to import settings - invalid file");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Preset Management */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Package
              className="text-purple-600 dark:text-purple-400"
              size={24}
            />
            <h2 className="text-2xl font-bold">Preset Management</h2>
          </div>

          {/* Save New Preset */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3">
              Save Current Settings as Preset
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Enter preset name..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-500 outline-none"
                onKeyPress={(e) => e.key === "Enter" && handleSavePreset()}
              />
              <button
                onClick={handleSavePreset}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition flex items-center gap-2"
              >
                <Save size={18} />
                Save
              </button>
            </div>
          </div>

          {/* Saved Presets */}
          <div>
            <h3 className="font-semibold mb-3">
              Saved Presets ({presets.length})
            </h3>
            {presets.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Package size={48} className="mx-auto mb-2 opacity-50" />
                <p>No saved presets yet</p>
                <p className="text-sm">
                  Save your current settings above to create a preset
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex-1">
                      <h4 className="font-semibold">{preset.name}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Created{" "}
                        {new Date(preset.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleLoadPreset(preset.id)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(preset.id)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition text-sm"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Import/Export */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold mb-6">Import / Export</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={handleExport}
              className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-purple-500 transition group"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition">
                  <Download
                    className="text-purple-600 dark:text-purple-400"
                    size={32}
                  />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold mb-1">Export Settings</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Download all settings and presets as JSON
                  </p>
                </div>
              </div>
            </button>

            <label className="p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 transition group cursor-pointer">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition">
                  <Upload
                    className="text-blue-600 dark:text-blue-400"
                    size={32}
                  />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold mb-1">Import Settings</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Upload a previously exported settings file
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Account Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <User className="text-green-600 dark:text-green-400" size={24} />
            <h2 className="text-2xl font-bold">Account Settings</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-50">
              <h3 className="font-semibold mb-2">Email Preferences</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Manage notification and marketing emails
              </p>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-50">
              <h3 className="font-semibold mb-2">Change Password</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Update your account password
              </p>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-50">
              <h3 className="font-semibold mb-2">Two-Factor Authentication</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Add an extra layer of security to your account
              </p>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-6">
            <Lock className="text-blue-600 dark:text-blue-400" size={24} />
            <h2 className="text-2xl font-bold">Data & Privacy</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-50">
              <h3 className="font-semibold mb-2">Download My Data</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Export all your personal data in machine-readable format
              </p>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg opacity-50">
              <h3 className="font-semibold mb-2">Clear Analytics Data</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Delete all your usage statistics and analytics
              </p>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 border-2 border-red-200 dark:border-red-900/50">
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle
              className="text-red-600 dark:text-red-400"
              size={24}
            />
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
              Danger Zone
            </h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg opacity-50">
              <h3 className="font-semibold mb-2">Delete Account</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Permanently delete your account and all associated data. This
                action cannot be undone.
              </p>
              <div className="text-sm text-gray-500">Coming Soon</div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Delete Preset?</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete this preset? This action cannot
                be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeletePreset(showDeleteConfirm)}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
