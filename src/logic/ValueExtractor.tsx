import { Selection } from "./datastructure/Selection";
import { MatchGroup } from "./Model";

/**
 * Helper class to extract a set of values from a selection (e.g., based on their prefixes or suffixes).
 */
export class ValueExtractor {
    /**
     * Form groups of matches based on their suffix and prefix.
     * If two values share the same prefix/suffix, then they are grouped together
     * Form all possible groups until no groups can be made
     * @param matches 
     */
    static groupSimilarValues(matches: Selection[]): MatchGroup[] {
        const groups = []; // Always at least one group with every value
        for (let matchIdx = 0; matchIdx < matches.length; ++matchIdx) {
            const match = matches[matchIdx];

            for (let length = 1; length < 20; ++length) { // Arbitrarily set the prefix/suffix to be limited to 20 characters
                // Look for all matches which have the same prefix or suffix
                const prefixMatches = new Set<Selection>();
                const suffixMatches = new Set<Selection>();
                const prefix = match.getPrefix(length);
                const suffix = match.getSuffix(length);

                for (let candidateMatchIdx = 0; candidateMatchIdx < matches.length; ++candidateMatchIdx) {
                    const candidateMatch = matches[candidateMatchIdx];
                    if (candidateMatch.isPrefixed(prefix, true)) {
                        prefixMatches.add(candidateMatch);
                    }

                    if (candidateMatch.isSuffixed(suffix, true)) {
                        suffixMatches.add(candidateMatch);
                    }
                }

                if (prefixMatches.size > 1) {
                    groups.push(new MatchGroup(prefixMatches, prefix, ""));
                }

                if (suffixMatches.size > 1) {
                    groups.push(new MatchGroup(suffixMatches, "", suffix));
                }

                if (prefixMatches.size === 1 && suffixMatches.size === 1) {
                    // Stop early as it is not possible to find groups anymore
                    break;
                }
            }
        }



        // Merge all groups containing the same matches
        let mergedGroups: MatchGroup[] = [];
        for (let groupIdx = 0; groupIdx < groups.length; ++groupIdx) {
            let group = groups[groupIdx];

            let candidateGroupIdx = groupIdx + 1;
            while (candidateGroupIdx < groups.length) {
                const candidate = groups[candidateGroupIdx];

                if (group.isEqual(candidate)) {
                    group = group.merge(candidate);
                    // Remove the group from the list
                    groups.splice(candidateGroupIdx, 1);
                } else {
                    candidateGroupIdx++;
                }
            }
            mergedGroups.push(group);
        }

        // Sort from most to least common
        mergedGroups = mergedGroups.sort((a, b) => { return b.matches.size - a.matches.size });

        // A bunch of assumptions to prune the ones that do not seem relevant
        // 1) Filter out the ones with space as suffix or prefix
        mergedGroups = mergedGroups.filter(v => v.suffix !== '' || !v.prefix.match("^\\s+$"));
        mergedGroups = mergedGroups.filter(v => v.prefix !== '' || !v.suffix.match("^\\s+$"));

        // 2) Filter out suffixes or prefixes that are just punctuation marks
        mergedGroups = mergedGroups.filter(v => v.suffix !== '' || !v.prefix.match("^\\s*[,\\.):]\\s*$"));
        mergedGroups = mergedGroups.filter(v => v.prefix !== '' || !v.suffix.match("^\\s*[,\\.(:]\\s*$"));

        // If it's not already in it, we add the group with ALL values
        const allMatches = new MatchGroup(new Set(matches), "", "")
        if (allMatches.matches.size > 0) {
            if (mergedGroups.length === 0 || mergedGroups[0].matches.size !== allMatches.matches.size) {
                mergedGroups = [allMatches].concat(mergedGroups)
            }
        }

        return mergedGroups; // Always have one with ALL matches
    }

    static regexp = new RegExp("[-+.]?[0-9]+[., ]?[0-9]*([eE][-+]?[0-9]+)?", "g");
    static extractValues(selection: Selection): Selection[] {
        const matches = [];

        selection.matchRegexp(ValueExtractor.regexp, (match, absoluteIndex) => {
            matches.push(selection.createSelection(selection.page, absoluteIndex, match[0].length));
        })

        return matches;
    }

    static extractMatchGroups(selection: Selection): MatchGroup[] {
        const values = this.extractValues(selection);
        return this.groupSimilarValues(values);
    }
}