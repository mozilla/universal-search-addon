
var cutOff = alexaSites.length;

var fuzzyDomains = FuzzySet();
function buildFuzzySet(set, alexaSites) {
  var site;
  var i = 1;
  alexaSites.forEach(function(site) {
    set.add({value: site, rank: 1 / i++});
  });
}

function fuzzyComplete(prefix) {
  var result = fuzzyDomains.get(prefix);

  return result[0] ? {
      score: result[0][0],
      domain: result[0][1]
    } : null;
}

// This has not been given much thought, but we do need a confidence score
function confidenceScore(match) {

  // Score and weights for the different scores. Will be normalized
  var scores = {};
  var weights = {
    subScore: 10,
    domainLevScore: 5,
    domainScore: 5
  };

  // Domain levenshtein
  if ( ! match.domain) throw new Error("match.domain is not defined");
  if ( match.distance < 0) throw new Error("match.distance is not positive: " + match.distance);

  // Distance will always be >= the difference between match.query and domain.length
  var minLength = Math.abs(match.domain.length - match.query.length);

  var distCoff = ( match.distance / match.domain.length);
  if (distCoff > 1) distCoff = 1.0;
  if ( distCoff < 0) throw new Error("distCoff negative: " + distCoff);
  scores.domainLevScore = 1.0 -  distCoff;

  // domainScore - i.e., how popular the domain is in Alexas ranking
  var inv = (cutOff - (match.rank - 1));
  var domainScore = (inv * inv) / (cutOff * cutOff);

  scores.domainScore = domainScore; //  < 0.3 ? 0.3 : domainScore;

  // Substring match score
  scores.subScore = match.substrPos == -1 ? 0 : (1 - (match.substrPos / match.domain.length));

  // Hacks
  // If subScore == 0 AND reasonably high levenshtein score, ignore the substring
  // i.e., don't penaltize simple spelling errors to much
  if (scores.subScore == 0 && scores.domainLevScore >= 0.60 ) {
    //    console.log("skipping subScore for query, domain", match.query, match.domain, domainScore, scores.domainLevScore);
    weights.subScore = 0;
  }

  // Add everything together, weigh each score using the
  // supplied weight.
  var sumWeights = 0, totalUnweighted = 0;
  for (var key in scores) {
    sumWeights += weights[key];
    // Negative values are treated as 0
    totalUnweighted += scores[key] > 0 ? scores[key] * weights[key] : 0;
  }

  var scoreWeighted = totalUnweighted / sumWeights;

  var score = scoreWeighted;
  if (score < 0) score = 0.0;

  // console.log("=============" + match.query + "===================")
  // console.log("totalUnweighted: %s, sumWeights: %s", totalUnweighted, sumWeights);
  // console.log("scores %s: %s", scores, domainScore);
  // console.log("final score", score);

  return score;
};

function findBestMatch(input) {
  // only look at top 100000 sites
  var bestMatch = {
    distance: 10000,
    score: 0
  };

  for (var i = 0; i < alexaSites.length; i++) {
    var site = alexaSites[i];
    if (!site) continue;
    var newMatch = {
      query: input,
      domain: site,
      name: site.match(/([^.]+)\./)[1],
      rank: i,
      distance: new Levenshtein(site, input).distance,
      substrPos: site.indexOf(input)
    };
    newMatch.score = confidenceScore(newMatch);
    if (newMatch.score > bestMatch.score) {
      bestMatch = newMatch;
    }
  }
  return bestMatch;
}

console.log("Building FuzzySet...");
buildFuzzySet(fuzzyDomains, alexaSites);
console.log("Built FuzzySet from %s sites", alexaSites.length);

// Test
// console.log(findBestMatch('fac'));
console.log(fuzzyComplete('fac'));
console.log(fuzzyComplete('fac'));
console.log(fuzzyComplete('faceboo'));
