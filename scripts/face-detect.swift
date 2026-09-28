import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("\(path)\tERROR"); continue
    }
    let req = VNDetectFaceRectanglesRequest()
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    let faces = (req.results ?? [])
    guard let f = faces.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else {
        print("\(path)\tNOFACE"); continue
    }
    // Vision origin is bottom-left; convert centre to top-left percentages.
    let b = f.boundingBox
    let cx = (b.midX) * 100
    let cy = (1 - b.midY) * 100
    print(String(format: "%@\t%d\tcx=%.1f\tcy=%.1f\tw=%.1f\th=%.1f", path, faces.count, cx, cy, b.width*100, b.height*100))
}
