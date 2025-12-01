/**
 * ONNX PARSER
 * Parses ONNX model files to extract architecture information
 * Uses protobufjs to decode ONNX protobuf format
 */

class ONNXParser {
    constructor() {
        this.model = null;
        this.graph = null;
    }

    /**
     * Parse ONNX model from file
     * @param {File} file - ONNX model file
     * @returns {Promise<Object>} - Parsed model information
     */
    async parseModel(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // ONNX uses protobuf format
            // We'll parse the basic structure manually
            const modelData = await this.decodeONNX(bytes);

            return modelData;
        } catch (error) {
            console.error('Error parsing ONNX model:', error);
            throw error;
        }
    }

    /**
     * Decode ONNX protobuf format
     * @param {Uint8Array} bytes - Model bytes
     * @returns {Promise<Object>} - Decoded model data
     */
    async decodeONNX(bytes) {
        try {
            // Load ONNX proto definition
            const root = await protobuf.load('https://raw.githubusercontent.com/onnx/onnx/main/onnx/onnx.proto');
            const ModelProto = root.lookupType('onnx.ModelProto');

            // Decode the model
            const message = ModelProto.decode(bytes);
            const object = ModelProto.toObject(message, {
                longs: String,
                enums: String,
                bytes: String,
            });

            this.model = object;
            this.graph = object.graph;

            return this.extractModelInfo();
        } catch (error) {
            // Fallback: manual parsing if proto loading fails
            console.warn('Protobuf parsing failed, using fallback:', error);
            return this.fallbackParsing(bytes);
        }
    }

    /**
     * Extract structured model information
     * @returns {Object} - Model architecture info
     */
    extractModelInfo() {
        if (!this.graph) {
            return null;
        }

        const layers = this.graph.node.map((node, index) => {
            return {
                index: index,
                name: node.name || `Layer_${index}`,
                type: node.opType || 'Unknown',
                inputs: node.input || [],
                outputs: node.output || [],
                attributes: this.parseAttributes(node.attribute || [])
            };
        });

        // Extract input/output info
        const inputs = this.graph.input.map(input => ({
            name: input.name,
            type: this.parseTensorType(input.type),
            shape: this.parseShape(input.type)
        }));

        const outputs = this.graph.output.map(output => ({
            name: output.name,
            type: this.parseTensorType(output.type),
            shape: this.parseShape(output.type)
        }));

        // Extract initializers (weights)
        const initializers = this.graph.initializer?.map(init => ({
            name: init.name,
            dataType: init.dataType,
            dims: init.dims
        })) || [];

        // Count operations by type
        const opCounts = {};
        layers.forEach(layer => {
            opCounts[layer.type] = (opCounts[layer.type] || 0) + 1;
        });

        return {
            modelVersion: this.model.irVersion,
            producerName: this.model.producerName,
            producerVersion: this.model.producerVersion,
            domain: this.model.domain,
            graphName: this.graph.name,
            layers: layers,
            inputs: inputs,
            outputs: outputs,
            initializers: initializers,
            opCounts: opCounts,
            totalLayers: layers.length,
            totalParameters: initializers.length
        };
    }

    /**
     * Parse node attributes
     * @param {Array} attributes - Node attributes
     * @returns {Object} - Parsed attributes
     */
    parseAttributes(attributes) {
        const parsed = {};
        attributes.forEach(attr => {
            parsed[attr.name] = this.getAttributeValue(attr);
        });
        return parsed;
    }

    /**
     * Get attribute value based on type
     * @param {Object} attr - Attribute object
     * @returns {*} - Attribute value
     */
    getAttributeValue(attr) {
        if (attr.i) return attr.i;
        if (attr.f) return attr.f;
        if (attr.s) return attr.s;
        if (attr.ints) return attr.ints;
        if (attr.floats) return attr.floats;
        if (attr.strings) return attr.strings;
        return null;
    }

    /**
     * Parse tensor type
     * @param {Object} type - Type object
     * @returns {string} - Tensor type name
     */
    parseTensorType(type) {
        if (!type || !type.tensorType) return 'Unknown';
        const elemType = type.tensorType.elemType;
        const typeMap = {
            1: 'float32',
            2: 'uint8',
            3: 'int8',
            6: 'int32',
            7: 'int64',
            11: 'float64'
        };
        return typeMap[elemType] || `Type_${elemType}`;
    }

    /**
     * Parse tensor shape
     * @param {Object} type - Type object
     * @returns {Array} - Shape dimensions
     */
    parseShape(type) {
        if (!type || !type.tensorType || !type.tensorType.shape) {
            return [];
        }
        return type.tensorType.shape.dim.map(d => {
            if (d.dimValue) return parseInt(d.dimValue);
            if (d.dimParam) return d.dimParam; // Dynamic dimension
            return '?';
        });
    }

    /**
     * Fallback parsing when protobuf fails
     * @param {Uint8Array} bytes - Model bytes
     * @returns {Object} - Basic model info
     */
    fallbackParsing(bytes) {
        // Try to extract basic info from binary
        const text = new TextDecoder().decode(bytes);

        // Count common operation types by searching for strings
        const opTypes = [
            'Conv', 'Relu', 'MaxPool', 'Add', 'Concat', 'Reshape',
            'Transpose', 'Sigmoid', 'Mul', 'MatMul', 'BatchNormalization',
            'Gemm', 'Softmax', 'Flatten', 'Dropout', 'Split', 'Slice',
            'Unsqueeze', 'Squeeze', 'Resize', 'Upsample'
        ];

        const opCounts = {};
        let totalLayers = 0;

        opTypes.forEach(opType => {
            const regex = new RegExp(opType, 'g');
            const matches = text.match(regex);
            if (matches && matches.length > 0) {
                opCounts[opType] = matches.length;
                totalLayers += matches.length;
            }
        });

        return {
            modelVersion: 'Unknown',
            producerName: 'Unknown',
            producerVersion: 'Unknown',
            domain: '',
            graphName: 'Main Graph',
            layers: [],
            inputs: [],
            outputs: [],
            initializers: [],
            opCounts: opCounts,
            totalLayers: totalLayers,
            totalParameters: 0,
            fallback: true,
            note: 'Limited information - full parsing failed'
        };
    }

    /**
     * Get operation icon based on type
     * @param {string} opType - Operation type
     * @returns {string} - FontAwesome icon class
     */
    static getOpIcon(opType) {
        const iconMap = {
            'Conv': 'fas fa-filter',
            'Relu': 'fas fa-bolt',
            'MaxPool': 'fas fa-compress',
            'Add': 'fas fa-plus',
            'Concat': 'fas fa-link',
            'Reshape': 'fas fa-arrows-alt',
            'Transpose': 'fas fa-exchange-alt',
            'Sigmoid': 'fas fa-wave-square',
            'Mul': 'fas fa-times',
            'MatMul': 'fas fa-th',
            'BatchNormalization': 'fas fa-balance-scale',
            'Gemm': 'fas fa-calculator',
            'Softmax': 'fas fa-chart-line',
            'Flatten': 'fas fa-compress-arrows-alt',
            'Dropout': 'fas fa-random',
            'Split': 'fas fa-cut',
            'Slice': 'fas fa-cut',
            'Resize': 'fas fa-expand',
            'Upsample': 'fas fa-expand-arrows-alt'
        };
        return iconMap[opType] || 'fas fa-cube';
    }

    /**
     * Get operation color based on type
     * @param {string} opType - Operation type
     * @returns {string} - Color hex code
     */
    static getOpColor(opType) {
        const colorMap = {
            'Conv': '#667eea',
            'Relu': '#f5576c',
            'MaxPool': '#4facfe',
            'Add': '#43e97b',
            'Concat': '#fa709a',
            'Reshape': '#f093fb',
            'Transpose': '#4facfe',
            'Sigmoid': '#c471f5',
            'Mul': '#feca57',
            'MatMul': '#667eea',
            'BatchNormalization': '#48dbfb',
            'Gemm': '#ff9ff3',
            'Softmax': '#54a0ff',
            'Flatten': '#ee5a6f',
            'Dropout': '#c8d6e5',
            'Split': '#10ac84',
            'Slice': '#10ac84',
            'Resize': '#00d2d3',
            'Upsample': '#01a3a4'
        };
        return colorMap[opType] || '#95afc0';
    }
}

// Make available globally
window.ONNXParser = ONNXParser;
