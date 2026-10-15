import sharp from 'sharp';
const D='/mnt/c/dev/privat/dnd-planner/static/branding/wizard/';
const off=await sharp(D+'gem-off.png').toBuffer(), on=await sharp(D+'gem-on.png').toBuffer();
const s=async(b,n)=>sharp(b).resize(n,n).toBuffer();
const div=await sharp(D+'divider.png').resize(600,56).toBuffer();
await sharp({create:{width:700,height:460,channels:3,background:'#f6ecd4'}}).composite([
 {input:off,left:40,top:20},{input:on,left:330,top:20},
 {input:await s(off,28),left:620,top:60},{input:await s(on,28),left:620,top:110},
 {input:await s(off,40),left:612,top:160},{input:await s(on,40),left:612,top:220},
 {input:div,left:50,top:330}]).png().toFile('/home/sani/dnd-art-queue/codex-ui/prev.png');
