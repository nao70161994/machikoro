#!/usr/bin/env python3
"""Generate self-contained SVG resources for the card-table paint experiment."""
import argparse
import copy
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

SVG_NS = 'http://www.w3.org/2000/svg'
XLINK_NS = 'http://www.w3.org/1999/xlink'
ALLOWED = {'svg', 'defs', 'symbol', 'g', 'path', 'rect', 'circle', 'ellipse',
           'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient',
           'stop', 'use', 'title', 'desc', 'clipPath', 'mask'}
LOCAL_ID = re.compile(r'^[A-Za-z][\w.-]*$', re.ASCII)
URL = re.compile(r'url\(\s*([\'"]?)(#[A-Za-z][\w.-]*)\1\s*\)', re.ASCII)
ET.register_namespace('', SVG_NS)
ET.register_namespace('xlink', XLINK_NS)


def load_source(path):
    source = path.read_text(encoding='utf-8')
    if re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b', source, re.I):
        raise ValueError('Document types and entities are forbidden')
    root = ET.fromstring(source)
    if root.tag != f'{{{SVG_NS}}}svg':
        raise ValueError('Expected an SVG document')
    ids, references = {}, {}
    for element in root.iter():
        if not element.tag.startswith(f'{{{SVG_NS}}}') or element.tag.split('}')[-1] not in ALLOWED:
            raise ValueError(f'Unsupported SVG element: {element.tag}')
        identifier = element.get('id')
        if identifier is not None:
            if not LOCAL_ID.fullmatch(identifier) or identifier in ids:
                raise ValueError(f'Invalid or duplicate id: {identifier}')
            ids[identifier] = element
        refs = set()
        for key, value in element.attrib.items():
            name = key.split('}')[-1]
            if name.lower().startswith('on') or name in {'style', 'src'}:
                raise ValueError(f'Forbidden attribute: {key}')
            if re.search(r'(?:javascript|https?|data|file):|//', value, re.I):
                raise ValueError(f'External or executable attribute: {key}')
            if name == 'href':
                if not value.startswith('#') or not LOCAL_ID.fullmatch(value[1:]):
                    raise ValueError(f'Nonlocal reference: {value}')
                refs.add(value[1:])
            matches = list(URL.finditer(value))
            refs.update(match.group(2)[1:] for match in matches)
            if re.search(r'url\s*\(', URL.sub('', value), re.I):
                raise ValueError(f'Unsupported paint reference: {value}')
        references[element] = refs
    for refs in references.values():
        for identifier in refs:
            if identifier not in ids:
                raise ValueError(f'Missing reference: {identifier}')
    return root, ids, references


def generate(root, ids, references):
    parent = {child: element for element in root.iter() for child in element}
    order = list(root.iter())
    result = {}
    for symbol in root.iter(f'{{{SVG_NS}}}symbol'):
        motif = symbol.get('id')
        if not motif:
            raise ValueError('Every symbol requires an id')
        needed, pending = {motif}, [motif]
        while pending:
            for element in ids[pending.pop()].iter():
                for reference in references[element]:
                    if reference not in needed:
                        needed.add(reference)
                        pending.append(reference)
        selected = {ids[identifier] for identifier in needed}
        # A selected ancestor already carries its descendants and their ids.
        def has_selected_ancestor(element):
            ancestor = parent.get(element)
            while ancestor is not None:
                if ancestor in selected:
                    return True
                ancestor = parent.get(ancestor)
            return False
        output = ET.Element(f'{{{SVG_NS}}}svg', {'viewBox': '0 0 160 80'})
        definitions = ET.SubElement(output, f'{{{SVG_NS}}}defs')
        for element in order:
            if element in selected and not has_selected_ancestor(element):
                definitions.append(copy.deepcopy(element))
        ET.SubElement(output, f'{{{SVG_NS}}}use', {'href': f'#{motif}', 'width': '100%', 'height': '100%'})
        result[f'{motif}.svg'] = ET.tostring(output, encoding='utf-8', xml_declaration=True) + b'\n'
    if not result:
        raise ValueError('No symbols found')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check generated files without writing')
    args = parser.parse_args()
    repository = Path(__file__).resolve().parents[1]
    destination = repository / 'icons/facility-art-images'
    try:
        generated = generate(*load_source(repository / 'icons/facility-art.svg'))
        existing = {path.name for path in destination.glob('*.svg')}
        extras = existing - generated.keys()
        if extras:
            raise ValueError(f'Unexpected generated files: {sorted(extras)}')
        if args.check:
            mismatches = [name for name, content in generated.items()
                          if not (destination / name).is_file() or (destination / name).read_bytes() != content]
            if mismatches:
                raise ValueError(f'Generated files differ: {mismatches}')
        else:
            destination.mkdir(parents=True, exist_ok=True)
            for name, content in generated.items():
                (destination / name).write_bytes(content)
        print(f'{"Checked" if args.check else "Generated"} {len(generated)} self-contained SVG images')
    except (OSError, ET.ParseError, ValueError) as error:
        print(f'Facility art generation failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
