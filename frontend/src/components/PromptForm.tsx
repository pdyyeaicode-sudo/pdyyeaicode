"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";

import type { BrandKit, DesignRequest, TargetSize } from "../types";
import styles from "../pages/DesignStudio.module.css";

export const INSTAGRAM: TargetSize = { width: 1080, height: 1080, unit: "px" };
export const A4: TargetSize = { width: 210, height: 297, unit: "mm" };
export const BANNER: TargetSize = { width: 1200, height: 400, unit: "px" };

const PRESET_SIZES: Record<string, TargetSize> = {
  INSTAGRAM,
  A4,
  BANNER,
};

export interface PromptFormProps {
  prompt: string;
  brandKit: BrandKit;
  targetSize: TargetSize;
  isGenerating: boolean;
  isUploading: boolean;
  onPromptChange: (text: string) => void;
  onBrandKitChange: (kit: Partial<BrandKit>) => void;
  onTargetSizeChange: (size: TargetSize) => void;
  onSubmit: (request: DesignRequest) => void | Promise<void>;
  onUploadImage: (file: File) => void | Promise<void>;
}

export function PromptForm({
  prompt,
  brandKit,
  targetSize,
  isGenerating,
  isUploading,
  onPromptChange,
  onBrandKitChange,
  onTargetSizeChange,
  onSubmit,
  onUploadImage,
}: PromptFormProps): JSX.Element {
  const selectedPreset = getPresetKey(targetSize);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptFileRef = useRef<HTMLInputElement | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string>("");
  const isBusy = isGenerating || isUploading;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      prompt,
      brandKit,
      targetSize,
      outputFormat: "svg",
      sessionHistory: [],
    });
  }

  function handlePresetChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextPreset = event.target.value;
    if (nextPreset === "CUSTOM") {
      return;
    }

    onTargetSizeChange(PRESET_SIZES[nextPreset]);
  }

  function handleNumericChange(field: "width" | "height", value: string): void {
    const parsedValue = Number.parseFloat(value);
    onTargetSizeChange({
      ...targetSize,
      [field]: Number.isFinite(parsedValue) ? parsedValue : 0,
    });
  }

  function handleUploadClick(): void {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextFile = event.target.files?.[0];
    if (!nextFile) {
      return;
    }

    setSelectedFilename(nextFile.name);
    void onUploadImage(nextFile);
    event.target.value = "";
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <fieldset disabled={isBusy} className={styles.fieldset}>
        <legend className={styles.legend}>Design Request</legend>

        <label className={styles.field}>
          <span>Prompt</span>
          <div className={styles.textareaWrapper}>
            <textarea
              className={styles.textarea}
              name="prompt"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              rows={5}
              aria-label="Design prompt"
            />
            <button
              type="button"
              className={styles.promptAttachButton}
              aria-label="Attach file"
              title="Attach file"
              onClick={() => promptFileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); promptFileRef.current?.click(); } }}
            >
              <Paperclip size={16} />
            </button>
          </div>
        </label>

        <label className={styles.field}>
          <span>Preset Size</span>
          <select className={styles.select} value={selectedPreset} onChange={handlePresetChange}>
            <option value="INSTAGRAM">Instagram</option>
            <option value="A4">A4</option>
            <option value="BANNER">Banner</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Width</span>
          <input
            className={styles.input}
            type="number"
            inputMode="decimal"
            value={targetSize.width}
            onChange={(event) => handleNumericChange("width", event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>Height</span>
          <input
            className={styles.input}
            type="number"
            inputMode="decimal"
            value={targetSize.height}
            onChange={(event) => handleNumericChange("height", event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>Unit</span>
          <select
            className={styles.select}
            value={targetSize.unit}
            onChange={(event) =>
              onTargetSizeChange({
                ...targetSize,
                unit: event.target.value as TargetSize["unit"],
              })}
          >
            <option value="px">px</option>
            <option value="mm">mm</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Primary Color</span>
          <input
            className={styles.input}
            type="text"
            value={brandKit.primaryColor}
            onChange={(event) => onBrandKitChange({ primaryColor: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Secondary Color</span>
          <input
            className={styles.input}
            type="text"
            value={brandKit.secondaryColor}
            onChange={(event) => onBrandKitChange({ secondaryColor: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Font Family</span>
          <input
            className={styles.input}
            type="text"
            value={brandKit.fontFamily}
            onChange={(event) => onBrandKitChange({ fontFamily: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Logo URL</span>
          <input
            className={styles.input}
            type="url"
            value={brandKit.logoUrl}
            onChange={(event) => onBrandKitChange({ logoUrl: event.target.value })}
          />
        </label>

        <label className={styles.field}>
          <span>Tone</span>
          <select
            className={styles.select}
            value={brandKit.tone}
            onChange={(event) =>
              onBrandKitChange({ tone: event.target.value as BrandKit["tone"] })}
          >
            <option value="bold">bold</option>
            <option value="minimal">minimal</option>
            <option value="festive">festive</option>
            <option value="corporate">corporate</option>
          </select>
        </label>

        <button className={styles.button} type="submit">{isGenerating ? "Generating..." : "Generate Design"}</button>
        <div className="prompt-form-divider" role="separator" aria-label="Alternative upload option">
          <span className="prompt-form-divider-label">OR</span>
        </div>
        <input
          ref={fileInputRef}
          className="prompt-form-upload-input"
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileChange}
        />
        <input
          ref={promptFileRef}
          className="prompt-form-upload-input"
          type="file"
          accept="image/*,.svg,.pdf"
          hidden
          onChange={(e) => {
            const nextFile = e.target.files?.[0];
            if (!nextFile) return;
            setSelectedFilename(nextFile.name);
            void onUploadImage(nextFile);
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className={styles.button}
          onClick={handleUploadClick}
          disabled={isBusy}
        >
          {isUploading ? "Uploading..." : "Upload Your Image"}
        </button>
        <p
          className="upload-info"
          style={{ margin: "-0.25rem 0 0", color: "#5f6470", fontSize: "0.92rem", lineHeight: 1.5 }}
        >
          Uploaded image becomes your background. Add text and elements on top to customize. For AI layer
          separation, use Generate instead.
        </p>
        <div className="prompt-form-upload-meta" aria-live="polite">
          {selectedFilename ? <span className="prompt-form-upload-filename">{selectedFilename}</span> : null}
          {isUploading ? <span className="prompt-form-upload-spinner">AI is extracting layers... this takes about 30-60 seconds.</span> : null}
        </div>
      </fieldset>
    </form>
  );
}

function getPresetKey(targetSize: TargetSize): string {
  const presetEntry = Object.entries(PRESET_SIZES).find(([, preset]) => (
    preset.width === targetSize.width
    && preset.height === targetSize.height
    && preset.unit === targetSize.unit
  ));
  return presetEntry?.[0] ?? "CUSTOM";
}
