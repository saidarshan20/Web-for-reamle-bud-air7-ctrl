import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import { Plus, MoreHorizontal, Pencil, Type, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { AIR7_EQ_FREQUENCIES, CUSTOM_EQ_LIMIT, compatibleEQ, presetName, encodeEQName, type CustomPreset } from '@/lib/air7';

interface CustomEQCardProps {
  disabled: boolean;
  ready: boolean;
  presets: CustomPreset[];
  activePreset: number;
  onSavePreset: (id:number|null,name:string,bands:number[]) => Promise<boolean>;
  onSelectPreset: (id:number) => Promise<boolean>;
  onDeletePreset: (preset:CustomPreset) => Promise<boolean>;
}
interface EQDraft { id:number|null; name:string; bands:number[]; frequencies:number[] }

const bandLabels = [
  { name: 'Bass', freq: '170Hz' },
  { name: 'Low', freq: '400Hz' },
  { name: 'Mid', freq: '4.3k' },
  { name: 'Hi-Mid', freq: '9.5k' },
  { name: 'Treble', freq: '12k' },
  { name: 'Ultra', freq: 'ext' },
];

export function CustomEQCard({ presets, activePreset, onSavePreset, onSelectPreset, onDeletePreset, disabled, ready }: CustomEQCardProps) {
  const [draft,setDraft]=useState<EQDraft|null>(null);
  const [saving,setSaving]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<CustomPreset|null>(null);
  const nameRef=useRef<HTMLInputElement>(null);
  const bandRef=useRef<HTMLInputElement>(null);
  const editFocus=useRef<'name'|'band'|null>(null);
  const preset=presets.find(p=>p.id===activePreset && compatibleEQ(p)) ?? presets.find(compatibleEQ);
  const emptyDraft:EQDraft={id:null,name:'',bands:[0,0,0,0,0,0],frequencies:preset?.frequencies??AIR7_EQ_FREQUENCIES};
  const base:EQDraft=preset ? {id:preset.id,name:presetName(preset),bands:preset.gains,frequencies:preset.frequencies} : emptyDraft;
  const form=draft??base;
  const bands=form.bands, frequencies=form.frequencies;
  const original=presets.find(p=>p.id===form.id);
  const dirty=draft!==null && (form.id===null ? !!form.name || form.bands.some(v=>v!==0) : !original || JSON.stringify([form.name,form.bands])!==JSON.stringify([presetName(original),original.gains]));
  const blocked=disabled || !ready || saving;
  let nameError='';
  try { encodeEQName(form.name); } catch(e) { nameError=e instanceof Error?e.message:'Invalid preset name'; }
  const updateBand=(index:number,value:number)=>setDraft({...form,bands:bands.map((b,i)=>i===index?value:b)});
  const save=async()=>{
    setSaving(true);
    try { if(await onSavePreset(form.id,form.name,bands)) setDraft(null); }
    finally { setSaving(false); }
  };
  const select=async(id:number)=>{
    setSaving(true);
    try { if(await onSelectPreset(id)) setDraft(null); }
    finally { setSaving(false); }
  };
  const edit=(p:CustomPreset,rename=false)=>{
    setDraft({id:p.id,name:presetName(p),bands:[...p.gains],frequencies:[...p.frequencies]});
    editFocus.current=rename?'name':'band';
  };
  const remove=async()=>{
    if(!deleteTarget) return;
    setSaving(true);
    try { if(await onDeletePreset(deleteTarget)){setDraft(null);setDeleteTarget(null);} }
    finally { setSaving(false); }
  };

  return (
    <motion.div
      className="nm-raised rounded-[1.5rem] p-5 col-span-1 md:col-span-2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-6">
        <div className="nm-inset w-7 h-7 rounded-xl flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-primary" style={{ boxShadow: '0 0 6px hsl(var(--primary))' }} />
        </div>
        <h2 className="font-mono text-[0.65rem] font-bold tracking-[2px] uppercase text-muted-foreground">
          Custom EQ — 6 Band
        </h2>
      </div>

      {!ready && <p className="text-xs text-muted-foreground mb-4">Custom EQ is unavailable until the earbuds report a compatible preset list and command support.</p>}
      <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Saved custom EQ presets">
        {presets.map(p=><div key={p.id} className={`flex max-w-full items-center rounded-xl ${activePreset===p.id?'bg-primary text-primary-foreground':'nm-flat text-secondary-foreground'}`}>
          <button type="button" disabled={blocked || dirty || !compatibleEQ(p)} aria-pressed={activePreset===p.id} onClick={()=>void select(p.id)} className="min-w-0 break-all text-left pl-3 pr-2 py-2 rounded-l-xl text-sm font-medium disabled:opacity-50">{presetName(p)||`Preset ${p.id}`}</button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label={`Manage preset ${presetName(p)}`} disabled={blocked || dirty || !compatibleEQ(p)} className="p-2 mr-1 rounded-lg hover:bg-foreground/5 disabled:opacity-50"><MoreHorizontal className="w-4 h-4"/></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={e=>{if(editFocus.current){e.preventDefault();const field=editFocus.current;editFocus.current=null;requestAnimationFrame(()=>{if(field==='name'){nameRef.current?.focus();nameRef.current?.select();}else bandRef.current?.focus();});}}} className="theme-connected nm-raised rounded-2xl border-border/60 p-1.5 z-[70]">
              <DropdownMenuItem className="rounded-xl gap-2 py-2.5 focus:bg-primary/10 focus:text-primary" onSelect={()=>edit(p)}><Pencil className="w-3.5 h-3.5"/>Edit EQ</DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl gap-2 py-2.5 focus:bg-primary/10 focus:text-primary" onSelect={()=>edit(p,true)}><Type className="w-3.5 h-3.5"/>Rename</DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl gap-2 py-2.5 text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={()=>setDeleteTarget(p)}><Trash2 className="w-3.5 h-3.5"/>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>)}
        <button type="button" onClick={()=>setDraft(emptyDraft)} disabled={blocked || dirty || presets.length>=CUSTOM_EQ_LIMIT} className="nm-flat flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-primary disabled:opacity-50"><Plus className="w-3.5 h-3.5"/>New preset</button>
        <span className="ml-auto text-xs text-muted-foreground">{presets.length}/{CUSTOM_EQ_LIMIT} presets</span>
      </div>
      <div className="mb-5">
        <label htmlFor="custom-eq-name" className="text-xs text-muted-foreground font-medium mb-1.5 block">Preset name</label>
        <input ref={nameRef} id="custom-eq-name" type="text" maxLength={32} value={form.name} disabled={blocked} onChange={e=>setDraft({...form,name:e.target.value})} placeholder="e.g. Evening music" aria-invalid={!!form.name && !!nameError} aria-describedby="custom-eq-help" className="nm-select w-full px-3 py-2.5 rounded-xl text-sm font-medium outline-none disabled:opacity-50"/>
        <p id="custom-eq-help" className="text-xs text-muted-foreground mt-2" aria-live="polite">{form.name && nameError ? nameError : dirty ? 'Unsaved changes. Save to apply them to your earbuds.' : form.id===null ? 'Name your new preset and adjust the bands below.' : 'Saved on the earbuds. Edit the name or bands, then save.'}</p>
      </div>
      <div className="grid grid-cols-6 gap-3 md:gap-5">
        {bands.map((val, i) => {
          const pct = ((val + 6) / 12) * 100;
          const colorClass = val > 0 ? 'text-[hsl(var(--success))]' : val < 0 ? 'text-[hsl(var(--destructive))]' : 'text-primary';

          return (
            <div key={i} className="flex flex-col items-center gap-3">
              {/* Value badge */}
              <motion.span
                key={val}
                initial={{ scale: 1.25, y: -3 }}
                animate={{ scale: 1, y: 0 }}
                className={`font-mono text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-lg ${colorClass}`}
                style={{
                  background: 'hsl(var(--nm-base))',
                  boxShadow: 'inset 2px 2px 5px var(--nm-shadow-dark), inset -2px -2px 5px var(--nm-shadow-light)',
                }}
              >
                {val >= 0 ? '+' : ''}{val}
              </motion.span>

              {/* Vertical slider track */}
              <div className="relative h-32 w-9 flex items-center justify-center">
                {/* Inset track */}
                <div
                  className="absolute h-full w-2 rounded-full overflow-hidden"
                  style={{
                    background: 'hsl(var(--nm-base))',
                    boxShadow: 'inset 2px 2px 6px var(--nm-shadow-dark), inset -2px -2px 6px var(--nm-shadow-light)',
                  }}
                >
                  {/* Fill bar */}
                  <motion.div
                    className="absolute bottom-0 w-full rounded-full"
                    animate={{ height: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                    style={{
                      background: 'hsl(var(--primary))',
                      boxShadow: '0 0 8px var(--nm-glow)',
                    }}
                  />
                </div>

                {/* Invisible input on top */}
                <input
                  id={`eq-band-${i}`}
                  ref={i===0?bandRef:undefined}
                  type="range"
                  disabled={blocked}
                  min={-6}
                  max={6}
                  value={val}
                  onChange={(e) => updateBand(i, parseInt(e.target.value))}
                  className="absolute h-full w-full opacity-0 cursor-pointer"
                  aria-label={`Custom EQ band ${i + 1}`}
                  style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                />

                {/* Raised thumb */}
                <motion.div
                  className="absolute w-4 h-4 rounded-full pointer-events-none"
                  animate={{ bottom: `calc(${pct}% - 8px)` }}
                  transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                  style={{
                    background: 'hsl(var(--primary))',
                    boxShadow: '2px 2px 6px var(--nm-shadow-dark), 0 0 10px var(--nm-glow)',
                    position: 'absolute',
                  }}
                />
              </div>

              {/* Band label */}
              <div className="text-center">
                <div className="font-mono text-[0.58rem] text-foreground/70 leading-tight font-medium">
                  {bandLabels[i].name}
                </div>
                <div className="font-mono text-[0.5rem] text-muted-foreground/50">
                  {frequencies[i] ? (frequencies[i] >= 1000 ? frequencies[i] / 1000 + 'kHz' : frequencies[i] + 'Hz') : '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-5">
        <button type="button" disabled={blocked || !dirty || !!nameError || (form.id===null && presets.length>=CUSTOM_EQ_LIMIT)} onClick={()=>void save()} className="nm-btn-primary px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">{saving?'Saving…':form.id===null?'Create preset':'Save preset'}</button>
        {draft!==null && <button type="button" disabled={blocked} onClick={()=>setDraft(null)} className="nm-flat px-4 py-2.5 rounded-xl text-sm font-medium text-secondary-foreground disabled:opacity-50">Cancel</button>}
      </div>
      <AlertDialog open={deleteTarget!==null} onOpenChange={open=>{if(!open && !saving)setDeleteTarget(null);}}>
        <AlertDialogContent className="theme-connected nm-raised rounded-[1.5rem] border-border/60 max-w-[min(420px,calc(100vw-32px))]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete preset?</AlertDialogTitle>
            <AlertDialogDescription>Remove “{deleteTarget?presetName(deleteTarget):''}” from your earbuds? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} className="nm-flat rounded-xl border-0">Keep preset</AlertDialogCancel>
            <AlertDialogAction disabled={blocked} onClick={e=>{e.preventDefault();void remove();}} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90">{saving?'Deleting…':'Delete preset'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
