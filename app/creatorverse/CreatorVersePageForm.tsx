'use client';

import Image from 'next/image';

import { useEffect, useState, type FormEvent } from 'react';
import {
  CREATORVERSE_CATEGORIES,
  type CreatorVerseCategory,
  type PageFields,
} from '@/lib/creatorverse/types';
import {
  publicUrl,
  validatePageFields,
} from '@/lib/creatorverse/validation';
import styles from './CreatorVersePageForm.module.css';

type Images = { logo: File | null; cover: File | null };

type Props = {
  initial?: PageFields;
  onSave?: (fields: PageFields, images: Images) => Promise<void>;
  heading?: string;
  buttonLabel?: string;
  successMessage?: string;
};

const empty: PageFields = {
  name: '',
  category: 'business',
  short_bio: '',
  description: '',
  website: null,
  social_links: [],
  public_email: null,
  location: '',
};

export default function CreatorVersePageForm({
  initial,
  onSave,
  heading = 'Create your CreatorVerse page',
  buttonLabel = 'Save Page',
  successMessage = 'Page information saved.',
}: Props) {
  const [fields, setFields] = useState<PageFields>(
    () => initial
      ? { ...initial, social_links: [...initial.social_links] }
      : { ...empty, social_links: [] }
  );
  const [logo, setLogo] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [logoPreview, coverPreview]);

  function update<K extends keyof PageFields>(
    key: K,
    value: PageFields[K]
  ) {
    setFields(previous => ({ ...previous, [key]: value }));
    setMessage('');
  }

  function selectImage(kind: 'logo' | 'cover', file: File | null) {
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setMessage('Choose an image smaller than 5 MB.');
      return;
    }

    const preview = file ? URL.createObjectURL(file) : null;

    if (kind === 'logo') {
      setLogo(file);
      setLogoPreview(preview);
    } else {
      setCover(file);
      setCoverPreview(preview);
    }
    setMessage('');
  }

  function addLink() {
    try {
      const label = linkLabel.trim();
      const url = publicUrl(linkUrl);
      if (!label || label.length > 60 || !url) {
        throw new Error('Enter a link name and a valid website URL.');
      }
      if (fields.social_links.length >= 8) {
        throw new Error('Maximum eight links.');
      }
      update('social_links', [...fields.social_links, { label, url }]);
      setLinkLabel('');
      setLinkUrl('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invalid link.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    try {
      if (linkLabel.trim() || linkUrl.trim()) {
        throw new Error('Add or clear the unfinished social link.');
      }

      const validated = validatePageFields(fields);
      setBusy(true);

      if (onSave) {
        await onSave(validated, { logo, cover });
        setMessage(successMessage);
      } else {
        setMessage('Draft validated locally. Nothing was saved or uploaded.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to validate page.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={event => void submit(event)}>
      <header>
        <h2>{heading}</h2>
        <p>Your brand. Your content. Your audience.</p>
      </header>

      <section className={styles.preview} aria-label="Page preview">
        <div
          className={styles.previewBanner}
          role={coverPreview ? 'img' : undefined}
          aria-label={coverPreview ? 'Selected cover photo' : undefined}
          style={coverPreview ? {
            backgroundImage: `url("${coverPreview}")`
          } : undefined}
        >
          {!coverPreview && <Image className={styles.defaultGhost} src={"/parapost-icon-white.png"} alt="ParaGhost — official Parapost Network mascot" width={160} height={110} />}
        </div>
        <div
          className={styles.previewLogo}
          role="img"
          aria-label={logoPreview ? 'Selected logo' : 'Default page logo'}
          style={logoPreview ? {
            backgroundImage: `url("${logoPreview}")`
          } : undefined}
        >
          {!logoPreview && (fields.name.trim()[0] ?? 'C').toUpperCase()}
        </div>
        <h3>{fields.name.trim() || 'Your page name'}</h3>
        <p>{CREATORVERSE_CATEGORIES[fields.category]}</p>
        <p>{fields.short_bio || 'Your page introduction appears here.'}</p>
      </section>

      <div className={styles.imageFields}>
        <label className={styles.field}>
          Logo or profile image
          <input type="file" accept="image/jpeg,image/png,image/webp"
            onChange={e => selectImage('logo', e.target.files?.[0] ?? null)} />
          {logo && <small>Selected: {logo.name}</small>}
        </label>

        <label className={styles.field}>
          Cover photo
          <input type="file" accept="image/jpeg,image/png,image/webp"
            onChange={e => selectImage('cover', e.target.files?.[0] ?? null)} />
          {cover && <small>Selected: {cover.name}</small>}
        </label>
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          Page name *
          <input required minLength={3} maxLength={100}
            value={fields.name}
            onChange={e => update('name', e.target.value)}
            placeholder="Enter your page name" />
        </label>

        <label className={`${styles.field} ${styles.desktopCategory}`}>
          Category *
          <select value={fields.category}
            onChange={e => update('category', e.target.value as CreatorVerseCategory)}>
            {Object.entries(CREATORVERSE_CATEGORIES).map(([key, label]) =>
              <option key={key} value={key}>{label}</option>
            )}
          </select>
        </label>

        <div className={`${styles.field} ${styles.mobileCategory}`}>
          <span>Category *</span>
          <button
            type="button"
            className={styles.categoryTrigger}
            aria-expanded={categoryMenuOpen}
            aria-label={`Category: ${CREATORVERSE_CATEGORIES[fields.category]}`}
            onClick={() => setCategoryMenuOpen(open => !open)}
          >
            <span>{CREATORVERSE_CATEGORIES[fields.category]}</span>
            <span aria-hidden="true">▾</span>
          </button>

          {categoryMenuOpen && (
            <div className={styles.categoryOptions}
              role="group" aria-label="Choose a category"
              onKeyDown={e => {
                if (e.key === 'Escape') setCategoryMenuOpen(false);
              }}>
              {Object.entries(CREATORVERSE_CATEGORIES).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={styles.categoryOption}
                  aria-pressed={fields.category === key}
                  onClick={() => {
                    update('category', key as CreatorVerseCategory);
                    setCategoryMenuOpen(false);
                  }}
                >
                  <span>{label}</span>
                  <span aria-hidden="true">
                    {fields.category === key ? '✓' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <label className={`${styles.field} ${styles.full}`}>
          Short bio
          <input maxLength={240} value={fields.short_bio}
            onChange={e => update('short_bio', e.target.value)}
            placeholder="Briefly introduce your page" />
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          About your page
          <textarea rows={5} maxLength={5000}
            value={fields.description}
            onChange={e => update('description', e.target.value)}
            placeholder="Tell visitors about your business, team or creative work" />
        </label>





        <label className={styles.field}>
          Website
          <input type="url" value={fields.website ?? ''}
            onChange={e => update('website', e.target.value || null)}
            placeholder="https://example.com" />
        </label>

        <label className={styles.field}>
          Location or service area
          <input maxLength={160} value={fields.location}
            onChange={e => update('location', e.target.value)}
            placeholder="Optional" />
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          Public contact email
          <input type="email" value={fields.public_email ?? ''}
            onChange={e => update('public_email', e.target.value || null)}
            placeholder="Optional public business email" />
        </label>
      </div>

      <section className={styles.links}>
        <h3>Social and external links</h3>
        <p>Add up to eight links to your channels, podcasts or websites.</p>

        <div className={styles.linkInputs}>
          <input aria-label="Link name" maxLength={60}
            placeholder="e.g. YouTube"
            value={linkLabel}
            onChange={e => setLinkLabel(e.target.value)} />
          <input aria-label="Link URL" type="url"
            placeholder="https://..."
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)} />
          <button type="button" onClick={addLink}
            disabled={fields.social_links.length >= 8}>
            Add link
          </button>
        </div>

        {fields.social_links.map((link, index) =>
          <div className={styles.linkItem} key={`${index}-${link.url}`}>
            <span>{link.label}: {link.url}</span>
            <button type="button"
              aria-label={`Remove ${link.label}`}
              onClick={() => update('social_links',
                fields.social_links.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        )}
      </section>



      {message && <p role="status" className={styles.message}>{message}</p>}

      <button type="submit" disabled={busy}>
        {busy ? 'Checking…' : onSave ? buttonLabel : 'Validate Draft'}
      </button>
      <p className={styles.note}>
        Image selection is local only until secure uploads are implemented.
        No database changes are made by this form.
      </p>
    </form>
  );
}
