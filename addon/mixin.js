import Ember from 'ember';
import Errors from 'ember-validations/errors';

var setValidityMixin = Ember.Mixin.create({
  isValid: Ember.computed('validators.@each.isValid', function() {
    return this.get('validators').compact().filterBy('isValid', false).get('length') === 0;
  }),
  isInvalid: Ember.computed.not('isValid')
});

var pushValidatableObject = function(model, property) {
  var content = model.get(property);

  model.removeObserver(property, pushValidatableObject);
  if (Ember.isArray(content)) {
    model.validators.pushObject(ArrayValidatorProxy.create({model: model, property: property, contentBinding: 'model.' + property}));
  } else {
    model.validators.pushObject(content);
  }
};

var lookupValidator = function(validator) {
  var container = this.get('container');
  return container.lookupFactory('ember-validations@validator:local/'+validator);

  // return Ember.Validations.validators.local[klass] || Ember.Validations.validators.remote[klass];
};

var ArrayValidatorProxy = Ember.ArrayProxy.extend(setValidityMixin, {
  validate: function() {
    return this._validate();
  },
  _validate: function() {
    var promises = this.get('content').invoke('_validate').without(undefined);
    return Ember.RSVP.all(promises);
  }.on('init'),
  validators: Ember.computed.alias('content')
});

export default Ember.Mixin.create(setValidityMixin, {
  init: function() {
    this._super();
    this.errors = Errors.create();
    this._dependentValidationKeys = {};
    this.validators = Ember.makeArray();
    if (this.get('validations') === undefined) {
      this.validations = {};
    }
    this.buildValidators();
    this.validators.forEach(function(validator) {
      validator.addObserver('errors.[]', this, function(sender) {
        var errors = Ember.makeArray();
        this.validators.forEach(function(validator) {
          if (validator.property === sender.property) {
            errors = errors.concat(validator.errors);
          }
        }, this);
        this.set('errors.' + sender.property, errors);
      });
    }, this);
  },
  buildValidators: function() {
    var property;

    for (property in this.validations) {
      if (this.validations[property].constructor === Object) {
        this.buildRuleValidator(property);
      } else {
        this.buildObjectValidator(property);
      }
    }
  },
  buildRuleValidator: function(property) {
    var validator;
    for (validator in this.validations[property]) {
      if (this.validations[property].hasOwnProperty(validator)) {
        this.validators.pushObject(lookupValidator.call(this, validator).create({model: this, property: property, options: this.validations[property][validator]}));
      }
    }
  },
  buildObjectValidator: function(property) {
    if (Ember.isNone(this.get(property))) {
      this.addObserver(property, this, pushValidatableObject);
    } else {
      pushValidatableObject(this, property);
    }
  },
  validate: function() {
    var self = this;
    return this._validate().then(function(vals) {
      var errors = self.get('errors');
      if (vals.contains(false)) {
        return Ember.RSVP.reject(errors);
      }
      return errors;
    });
  },
  _validate: Ember.on('init', function() {
    var promises = this.validators.invoke('_validate').without(undefined);
    return Ember.RSVP.all(promises);
  })
});