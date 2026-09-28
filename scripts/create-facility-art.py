"""Generate a geometric starter draft without overwriting curated production art."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

motifs = {
    'field': '<path d="M18 58Q78 35 144 60L138 73H22Z" fill="#c6ab60"/><path d="M36 66L62 51M57 69L83 52M82 71L104 55M109 71L124 61" stroke="#f9e1a0"/><path d="M40 49V20M58 46V17M76 44V23" stroke="#9b7439"/><path d="M40 36L31 28M40 30L49 22M58 34L49 24M58 28L67 19M76 35L85 27" stroke="#d7a755"/>',
    'ranch': '<path d="M18 62Q73 43 144 60V72H18Z" fill="#a9bf91"/><path d="M32 58V27L54 13L76 27V58Z" fill="#b97a62"/><path d="M28 28L54 10L80 28" fill="#617c86"/><path d="M45 58V38H63V58" fill="#f4e4bf"/><path d="M90 40H121V58H90Z" fill="#f9efdc"/><path d="M118 37H136V50H118ZM94 58V66M120 58V66" fill="#f9efdc"/><path d="M98 40H108V50H98Z" fill="#52616a"/>',
    'forest': '<path d="M15 64Q79 42 146 64V72H15Z" fill="#a6b991"/><path d="M44 66V35M80 65V23M116 65V38" stroke="#947052"/><path d="M21 52L44 12L66 52Z" fill="#73967c"/><path d="M52 51L80 4L108 51Z" fill="#557d6d"/><path d="M94 56L116 18L139 56Z" fill="#91ad83"/>',
    'mine': '<path d="M13 67L55 12L78 41L106 6L147 67Z" fill="#9fa7a6"/><path d="M91 26L106 6L122 27L109 22Z" fill="#e9e3cd"/><path d="M51 67V45Q77 24 102 45V67" fill="#485c64"/><path d="M44 42H108M49 40V69M103 40V69" stroke="#ad845e" stroke-width="7"/><path d="M63 71L70 52M95 71L86 52" stroke="#dbb26f"/>',
    'shop': '<path d="M34 65V29H126V65Z" fill="#ead6af"/><path d="M26 29L44 13H117L133 29Z" fill="#738a8c"/><path d="M30 34H130L123 45H37Z" fill="#bd7764"/><path d="M46 35V44M63 35V44M80 35V44M97 35V44M114 35V44" stroke="#f7e8c9" stroke-width="8"/><path d="M46 52H78V65H46ZM94 50H115V66" fill="#8dafa9"/>',
    'factory': '<path d="M30 64V34L58 19V34L85 19V34H126V64Z" fill="#bcc6be"/><path d="M108 34V9H122V34" fill="#af8068"/><path d="M42 46H56V56H42ZM67 46H81V56H67ZM95 46H112V64H95Z" fill="#769594"/><path d="M114 5Q94 1 100 11" stroke="#c5c7bc"/>',
    'harbor': '<path d="M13 60Q27 53 42 60T72 60T102 60T145 60M13 70Q27 63 42 70T72 70T102 70T145 70" stroke="#80a7b2"/><path d="M31 43H129L110 60H50Z" fill="#b67563"/><path d="M61 43V27H95V43Z" fill="#f4e5c5"/><path d="M82 26V7L116 26Z" fill="#dfc492"/><path d="M70 31H83V38H70Z" fill="#7797a1"/>',
    'civic': '<path d="M42 65V24H118V65Z" fill="#d9c6b5"/><path d="M33 24L80 7L128 24Z" fill="#8c7d94"/><path d="M52 30V57M71 30V57M90 30V57M109 30V57" stroke="#faecd1" stroke-width="7"/><path d="M34 64H127" stroke="#a69996" stroke-width="8"/>',
    'landmark': '<path d="M54 68V23H106V68Z" fill="#e7d3af"/><path d="M48 23L80 4L112 23Z" fill="#998099"/><circle cx="80" cy="37" r="11" fill="#fff3d7"/><path d="M80 30V37L86 40"/><path d="M70 68V55H90V68" fill="#7d9b98"/><path d="M43 70H117" stroke="#bbaa86" stroke-width="6"/>',
}
motifs.update({
    'station': '<path d="M24 66V28H136V66Z" fill="#e7d3af"/><path d="M18 28L42 12H118L142 28Z" fill="#738a8c"/><path d="M35 40H57V55H35ZM103 40H125V55H103Z" fill="#86a9ad"/><path d="M66 66V39H94V66Z" fill="#526c75"/><circle cx="80" cy="23" r="8" fill="#fff3d7"/><path d="M80 18V23L85 25M60 73L68 65M100 73L92 65"/>',
    'mall': '<path d="M21 67V26H139V67Z" fill="#ead6af"/><path d="M17 26L31 13H129L143 26Z" fill="#a07778"/><path d="M27 35H133V47H27Z" fill="#bf7965"/><path d="M40 35V47M64 35V47M88 35V47M112 35V47" stroke="#f7e8c9" stroke-width="11"/><path d="M32 54H59V66H32ZM101 54H128V66H101ZM69 52H91V67H69Z" fill="#86a9ad"/>',
    'park': '<circle cx="80" cy="33" r="26" fill="#f1dfb7"/><path d="M80 7V59M54 33H106M62 15L98 51M62 51L98 15" stroke="#ac8470"/><path d="M64 69L80 32L96 69" fill="none" stroke-width="5"/><circle cx="80" cy="33" r="5" fill="#e1b55e"/><path d="M73 4H87V14H73ZM103 27H117V38H103ZM43 27H57V38H43ZM73 53H87V64H73Z" fill="#b97a62"/><path d="M54 71H106" stroke="#bbaa86" stroke-width="5"/>',
    'radio': '<path d="M58 69L80 15L102 69ZM67 48H93M63 58H97M70 39L94 58M90 39L66 58" fill="none" stroke="#9f8278" stroke-width="4"/><circle cx="80" cy="14" r="5" fill="#e1b55e"/><path d="M66 5Q53 15 66 25M94 5Q107 15 94 25M56 2Q35 15 56 29M104 2Q125 15 104 29" fill="none" stroke="#809da5"/><path d="M50 71H110" stroke="#bbaa86" stroke-width="5"/>',
    'port': '<path d="M17 63Q30 56 43 63T69 63T95 63T121 63T147 63M17 72Q30 65 43 72T69 72T95 72T121 72T147 72" fill="none" stroke="#80a7b2"/><path d="M30 59L36 19H54L60 59Z" fill="#f3dfbd"/><path d="M33 39H57V47H33Z" fill="#b97a62"/><path d="M30 19L45 8L60 19ZM35 19H55V28H35Z" fill="#738a8c"/><path d="M79 48H143L132 61H91Z" fill="#b67563"/><path d="M94 48V35H122V48Z" fill="#f3dfbd"/>',
    'airport': '<path d="M23 68V43H118V68Z" fill="#d5d6c3"/><path d="M31 50H109V60H31Z" fill="#86a9ad"/><path d="M125 68V27H137V68ZM120 21H142V32H120Z" fill="#b99b81"/><path d="M28 22L66 25L95 10L104 13L84 28L115 32L117 38L76 35L61 46L54 44L61 33L31 29Z" fill="#f6e5c5"/>',
})
parts = ['<svg xmlns="http://www.w3.org/2000/svg"><defs>']
for name, body in motifs.items():
    parts.append(f'<symbol id="{name}" viewBox="0 0 160 80"><ellipse cx="80" cy="69" rx="64" ry="6" fill="#233747" opacity=".10"/><g stroke="#334b53" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{body}</g></symbol>')
parts.append('</defs></svg>')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    '--output', type=Path,
    default=ROOT / 'artifacts' / 'facility-art-draft.svg',
    help='draft output path (the curated icons/facility-art.svg is never overwritten)',
)
args = parser.parse_args()
output_path = args.output.resolve()
production_path = (ROOT / 'icons' / 'facility-art.svg').resolve()
if output_path == production_path:
    parser.error('refusing to overwrite curated production artwork; choose a draft output path')
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text('\n'.join(parts)+'\n')
print(f'Wrote draft illustration sheet: {output_path}')
