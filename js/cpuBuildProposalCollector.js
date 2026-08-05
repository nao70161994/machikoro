'use strict';

const CPUBuildProposalCollector = Object.freeze({
    create(adapters = {}) {
        let selected = null;

        function select(createProposal, value) {
            const proposal = typeof createProposal === 'function' ? createProposal(value) : null;
            if (proposal && !selected) selected = proposal;
            return !!proposal;
        }

        return Object.freeze({
            selectCard(card) {
                return select(adapters.createCardBuildAction, card);
            },
            selectLandmark(name) {
                return select(adapters.createLandmarkBuildAction, name);
            },
            selectedAction() {
                return selected;
            },
        });
    },
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUBuildProposalCollector };
if (typeof window !== 'undefined') window.CPUBuildProposalCollector = CPUBuildProposalCollector;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildProposalCollector = CPUBuildProposalCollector;
